const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const UserSchema = new mongoose.Schema(
{
name: {
type: String,
required: [true, "Name is required"],
trim: true,
},


email: {
  type: String,
  required: [true, "Email is required"],
  unique: true,
  lowercase: true,
  trim: true,
},

password: {
  type: String,
  required: [true, "Password is required"],
  minlength: 6,
  select: false,
},

role: {
  type: String,
  enum: ["admin"],
  default: "admin",
},

lastLogin: {
  type: Date,
  default: null,
},

// NEW: PASSWORD RESET FIELDS
resetPasswordToken: String,
resetPasswordExpire: Date,


},
{ timestamps: true }
);

// ---------------------------------------------------
// HASH PASSWORD BEFORE SAVING
// ---------------------------------------------------
UserSchema.pre("save", async function (next) {
if (!this.isModified("password")) return next();

const salt = await bcrypt.genSalt(12);
this.password = await bcrypt.hash(this.password, salt);

next();
});

// ---------------------------------------------------
// MATCH PASSWORD
// ---------------------------------------------------
UserSchema.methods.matchPassword = function (enteredPassword) {
return bcrypt.compare(enteredPassword, this.password);
};

// ---------------------------------------------------
// SIGN JWT
// ---------------------------------------------------
UserSchema.methods.getSignedJwtToken = function () {
return jwt.sign(
{ id: this._id, role: this.role },
process.env.JWT_SECRET,
{ expiresIn: "30d" }
);
};

// ---------------------------------------------------
// GENERATE RESET PASSWORD TOKEN
// ---------------------------------------------------
UserSchema.methods.getResetPasswordToken = function () {
const resetToken = crypto.randomBytes(32).toString("hex");

this.resetPasswordToken = crypto
.createHash("sha256")
.update(resetToken)
.digest("hex");

this.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 mins

return resetToken;
};

// ---------------------------------------------------
// REMOVE PASSWORD FROM JSON OUTPUT
// ---------------------------------------------------
UserSchema.methods.toJSON = function () {
const obj = this.toObject();
delete obj.password;
return obj;
};

module.exports = mongoose.model("User", UserSchema);
