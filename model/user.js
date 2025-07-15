const mongo = require("mongoose");
const { type } = require("os");

const userSchema = new mongo.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true,
    },

    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },

    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'], // Minimum length
    },

    verificationCode: {
        type: String,
        default: null,
    },

    isVerified: {
        type: Boolean,
        default: false,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    },


})

module.exports = mongo.model("User", userSchema);