const mongo = require("mongoose");
const user = require("./user");


const ChatModeSchema = new mongo.Schema({
    userId: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    }
})

module.exports = mongoose.model('Chat', ChatModeSchema);

