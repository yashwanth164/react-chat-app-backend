const jwt = require("jsonwebtoken");
const User = require("../models/user");
const otpGenerator = require("otp-generator");
const crypto = require("crypto");
const mailSender = require("../services/mailer");
const HTML_TEMPLATE = require("../utils/mailTemplate");
const filterObj = require("../utils/filterObj");
const { promisify } = require("util");

const signToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);

exports.register = async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "email",
    "password"
  );

  // check if a verified user with given email exists

  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    // user with this email already exists, Please login
    return res.status(400).json({
      status: "error",
      message: "Email already in use, Please login.",
    });
  } else if (existing_user) {
    // if not verified than update prev one

    await User.findOneAndUpdate({ email: email }, filteredBody, {
      new: true,
      validateModifiedOnly: true,
    });

    // generate an otp and send to email
    req.userId = existing_user._id;
    next();
  } else {
    // if user is not created before than create a new one
    const new_user = await User.create(filteredBody);

    // generate an otp and send to email
    req.userId = new_user._id;
    next();
  }
};

exports.sendOTP = async (req, res, next) => {
  const { userId } = req;
  const new_otp = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
  //OTP expires after 10 mins
  const otp_expiry_time = Date.now() + 10 * 60 * 1000; // 10 Mins after otp is sent

  const user = await User.findByIdAndUpdate(userId, {
    otp_expiry_time: otp_expiry_time,
  });

  user.otp = new_otp.toString();

  await user.save({ new: true, validateModifiedOnly: true });

  console.log(new_otp);

  // TODO Send mail to the user
  mailSender(
    {
      from: {
        name: "Kuku Chat",
        address: "yashkrissh@gmail.com",
      },
      to: user.email,
      subject: "OTP from Kuku Chat",
      html: HTML_TEMPLATE(`Your OTP is ${new_otp}, This is valid for 10 mins.`),
    },
    (info) => {
      console.log("Email sent successfully");
      console.log("MESSAGE ID: ", info.messageId);
      res.status(200).json({
        status: "success",
        message: "OTP sent successfully!",
      });
    }
  );
};

exports.verifyOTP = async (req, res, next) => {
  //verify OTP and update the user record
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP expired",
    });
  }

  if (user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
    return;
  }

  //OTP is correct, update the verified key in DB
  user.verified = true;
  user.otp = undefined;
  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "OTP verified Successfully!",
    token,
    user_id: user._id,
  });
};

exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      status: "error",
      message: "Email and Password are required",
    });
    return;
  }

  const user = await User.findOne({ email: email }).select("+password");

  // if (!user || !user.password) {
  //   res.status(400).json({
  //     status: "error",
  //     message: "Incorrect password",
  //   });

  //   return;
  // }

  if (!user || !(await user.correctPassword(password, user.password))) {
    res.status(400).json({
      status: "error",
      message: "Email or Password provided is incorrect",
    });
    return;
  }

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "Logged in successfully",
    token,
    user_id: user._id,
  });
};

//Types of routes -> protected(only logged in users can access them) & unprotected(open world users)

exports.protect = async (req, res, next) => {
  //Get the token and check if it is there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    req.status(400).json({
      status: "error",
      message: "JWT token is missing in the request",
    });
    return;
  }

  //Verification of user supplied token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //check is user still exist
  const this_user = await User.findById(decoded.userId);

  if (!this_user) {
    res.status(400).json({
      status: "error",
      message: "User does not exist",
    });
    return;
  }

  //Check if user changed his password after token was issued
  if (this_user.changedPasswordAfter(decoded.iat)) {
    res.status(400).json({
      status: "error",
      message: "User recently updated their password! please login again",
    });
  }

  req.user = this_user;
  next();
};

exports.forgotPassword = async (req, res, next) => {
  //find user emailID in DB
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "There is no user with given email address",
    });
  }

  //Generate random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    const resetURL = `https://kukuchat.com/auth/reset-password/?code=${resetToken}`;
    
    //TODO -> send email with reset URL
    
    console.log(resetURL);
    mailSender(
      {
        from: {
          name: "Kuku Chat",
          address: "yashkrissh@gmail.com",
        },
        to: user.email,
        subject: "Reset password link from Kuku Chat",
        html: HTML_TEMPLATE(`Your reset link  is ${resetURL}, This is valid for 10 mins.`),
      },
      (info) => {
        console.log("Email sent successfully");
        console.log("MESSAGE ID: ", info.messageId);
        res.status(200).json({
          status: "success",
          message: "Reset Password link sent to registered email",
        });
      }
    );
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(500).json({
      status: "error",
      message:
        "There was an error in sending the email, Please try again later",
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  //get user based on reset token in the URL
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.body.token)
    .digest("hex");
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  //if token expired or invalid
  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Token is invalid or expired",
    });
  }

  //Updated users password  and set reset token & expiry to undefined
  user.password = req.body.password;
  // user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = Date.now()
  await user.save();

  //Login the user and send new JWT
  //TODO -> send mail to user informing password reset
  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "Password reset successful",
    token,
  });
};
