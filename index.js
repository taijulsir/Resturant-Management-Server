const express = require('express')
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_PAYMENT_SECRET_KEY);
const app = express()
const port = process.env.PORT || 5000;


app.use(cors())
app.use(express.json())






const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.49cfwvw.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const menuCollection = client.db('resturantDB').collection('menu')
    const userCollection = client.db('resturantDB').collection('users')
    const reviewCollection = client.db('resturantDB').collection('reviews')
    const cartCollection = client.db('resturantDB').collection('carts')
    const paymentCollection = client.db('resturantDB').collection('payments')


    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      })
      res.send({ token })
    })


    // middleares verify token
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized access" })
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access' })
        }
        req.decoded = decoded;
        next()
      })
    }

    // verify admin  after geting verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      // console.log(email)
      const query = { email: email }
      const user = await userCollection.findOne(query)
      // console.log(user)
      const isAdmin = user?.role === "admin"
      // console.log(isAdmin)
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" })
      }
      next()
    }




    // payment confirm method
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      console.log('payment inside ', amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })

    })
    // all payment data
    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const query = {
        _id: {
          $in: payment.cartIds.map(id => new ObjectId(id))
        }
      }
      const deleteResult = await cartCollection.deleteMany(query)
      const paymentResult = await paymentCollection.insertOne(payment)
      res.send({ paymentResult, deleteResult })
    })

    // get all payment info by user email
    app.get('/payments/:email',verifyToken,async(req,res)=>{
      const query = {email: req.params.email}
      if(req.params.email !== req.decoded.email){
        return res.status(403).send({message: 'forbidden access'})
      }
      const payments = await paymentCollection.find(query).toArray()
      console.log(payments)
      res.send(payments)
    })

    // user related api
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingEmail = await userCollection.findOne(query)
      if (existingEmail) {
        return res.send({ message: 'User has already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(query, updatedDoc)
      res.send(result)
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })

    // admin check
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded?.email) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      const query = { email: email }
      const user = await userCollection.findOne(query)
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin })
    })

    // menu related api
    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item)
      res.send(result)
    })

    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray()
      res.send(result)
    })

    // single menu api
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      // console.log(id)
      const query = { _id: id }
      // console.log(query)
      const result = await menuCollection.findOne(query)
      // console.log(result)
      res.send(result)
    })

    // delete menu item
    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id)
      const query = { _id: id }
      console.log(query)
      const result = await menuCollection.deleteOne(query)
      console.log(result)
      res.send(result)
    })


    // review related api
    app.get('/review', async (req, res) => {
      const result = await reviewCollection.find().toArray()
      res.send(result)
    })

    // carts related api
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email }
      const result = await cartCollection.find(query).toArray()
      res.send(result)
    })

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      console.log(cartItem)
      const result = await cartCollection.insertOne(cartItem)
      res.send(result)
    })
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await cartCollection.deleteOne(query)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', async (req, res) => {
  res.send("Resturent Management server is running")
})
app.listen(port, () => {
  console.log(`Resturant management server is running on port ${port}`)
})