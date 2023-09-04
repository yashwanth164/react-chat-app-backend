const express = require("express");

const routes = require("./routes/index");

const morgan = require("morgan"); //give info on requests hitting the server.

const rateLimit = require("express-rate-limit");

const helmet = require("helmet"); //setup security headers for the application.

const mongosanitize = require("express-mongo-sanitize"); // sanitize the inputs

const bodyParser = require("body-parser");

// const xss = require("xss");

const cors = require("cors");

//App
const app = express();

//Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "PATCH", "POST", "DELETE", "PUT"],
    credentials: true,
  })
);
app.use(express.json({ limit: "10kb" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet());
app.use(mongosanitize());
// app.use(xss)

// if (process.env.NODE_ENV === "development") {
//   app.use(morgan("dev"));
// }
app.use(morgan("dev"));

const limiter = rateLimit({
  max: 3000,
  windowMs: 60 * 60 * 1000, //One hour
  message: "Too many requests from this IP, Please try again in hour",
});

app.use("/kuku", limiter);

app.use(
  express.urlencoded({
    extended: true,
  })
);

//Routing
app.use(routes);

module.exports = app;
