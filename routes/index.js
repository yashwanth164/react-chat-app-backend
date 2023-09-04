const router = require("express").Router();

const authRoute = require("./auth");
const userRoute = require("./user");

router.get("/", (req, res) => {
  res.status(200).json({
    message: "This is the message",
  });
  console.log("Get request");
});
router.use("/auth", authRoute);
router.use("/user", userRoute);

module.exports = router;
