const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const jwt = require('jsonwebtoken');
const cors = require('cors')
const port = process.env.PORT || 5000;
const app = express();




require('dotenv').config()
app.use(cors())
app.use(express.json());



//==============================================Verify JWT  (TOken jodi thake tahole jwt kaj korbe otherwise kaj korbe na)

function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization; // get method dara  localstorage theke token niye pathano hoy

    if (!authHeader) { // token na thakle she my item dhekte parbe na 

        return res.status(401).send({ message: 'UnAuthorized access' });

    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {


        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }


        req.decoded = decoded;
        next();
    });
}




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nwfoj.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


/**
           * API Naming Convention 
           
           * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
           * app.get('/booking/:id') // get a specific booking 
           * app.post('/booking') // add a new booking
           * app.patch('/booking/:id) // update kora
           * app.put (/booking/:id) // thakle update korbe  na thakle insert korbe
           * app.delete('/booking/:id) //
           
       */




async function run() {

    try {
        await client.connect();

        const serviceCollection = client.db('doctors-portal').collection('services')
        const bookingCollection = client.db('doctors-portal').collection('bookings')
        const userCollection = client.db('doctors-portal').collection('users')
        const doctorCollection = client.db('doctors_portal').collection('doctors');

        //========================================== Verify Admin 

        const verifyAdmin = async (req, res, next) => {

            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        //====================================== Get all service loading API

        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 }) // puro API theke sudhu service er naam gulo neyar jonno project kore sei property ta nite hoy ... 1 dile property dibe 2 dile property dibe na
            const services = await cursor.toArray();

            res.send(services)
        })

        //======================================= Get all users  Loading Api

        app.get('/users', verifyJWT, async (req, res) => {

            const users = await userCollection.find().toArray();
            res.send(users);
        });

        //===================================== Admin route protected API  ...orthat je admin na se ei route tai dhekte parbe na,

        app.get('/admin/:email', async (req, res) => {

            const email = req.params.email; // admin route je access nite chasche tar email nilam

            const user = await userCollection.findOne({ email: email }); // email diye sei user k nilam

            const isAdmin = user.role === 'admin'; // ebar oi user er property te role:admin ache ki na .. jodi thake (true) otherwise (false)

            res.send({ admin: isAdmin })

        })

        //======================================= Make a admin API // this is admin update api

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {

            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' }, //jake admin banabo ter property hisabe role:admin thakbe
            };

            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        //====================================New and old User checking api (JWT implement  main API for useToken)

        app.put('/user/:email', async (req, res) => {

            const email = req.params.email;

            const user = req.body;
            const filter = { email: email };

            const options = { upsert: true };

            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token })
        });



        // Warning: This is not the proper way to query multiple collection. 
        // After learning more about mongodb. use aggregate, lookup, pipeline, match, group


        //====================================Available  Slots API

        app.get('/available', async (req, res) => {

            const date = req.query.date;

            //get all service-09
            const services = await serviceCollection.find().toArray();
            console.log(services);

            //get the bookings of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();


            //for each service
            services.forEach(service => {
                console.log(service);
                // find serviceBookings for that service and bookings
                const serviceBookings = bookings.filter(book => book.treatmentName === service.name)


                // get all bookedSlots from the serviceBookings 
                const bookedSlots = serviceBookings.map(book => book.slot);


                // get availableSlots [bookedSlots er moddhe je gula nai oi gulai available hobe]
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))


                //finally update the slots
                service.slots = available;
            })

            res.send(services)
        })

        //============================================Payment route API

        app.get('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })


        //====================================== My Appointment API 

        app.get('/booking', verifyJWT, async (req, res) => {

            const patientEmail = req.query.patientEmail;

            const decodedEmail = req.decoded.email;

            if (patientEmail === decodedEmail) {

                const query = { patientEmail: patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' })
            }

        })


        // ================================== Booking Appointment Modal API  

        app.post('/booking', async (req, res) => {

            const booking = req.body;
            console.log(booking);


            const query = { //skip duplicate treatment for one user code start

                treatmentName: booking.treatmentName, // ekdin a ekta treatment neyar jonno date and patient check korte hobe
                date: booking.date,
                patientEmail: booking.patientEmail,
            }

            const exists = await bookingCollection.findOne(query)

            if (exists) {

                return res.send({ success: false, booking: exists })

            }//skip duplicate treatment for one user code end

            const result = await bookingCollection.insertOne(booking);
            console.log(result);
            return res.send({ success: true, result });

        })

        //====================================Get all doctor

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })

        //=================================== Add a Doctor API

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {

            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);

        });

        //======================================Delete API for a doctor

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {

            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);

        })






    }


    finally {

    }

}


run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello Doctor!')
})

app.listen(port, () => {
    console.log(`Server ok!! on port ${port}`)
})