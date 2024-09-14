const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const http = require("http");

const PORT = 4000;

const app = express();

app.use(express.json());
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  console.log("User connected", socket.id);
  socket.on("disconnect", () => {
    console.log("User disconnected", socket.id);
  });
});

async function main() {
  await mongoose.connect("mongodb://localhost:27017/CHATAPP");
}

main()
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error(error);
  });

app.get("/", (req, res) => {
  res.send("Hello ChatApp !");
});

// User //

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

app.post("/signup", async (req, res) => {
  try {
    const check = await User.findOne({ email: req.body.email });
    if (check) {
      return res.status(400).json({ errors: "User already exists" });
    }

    const user = new User({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
    });

    await user.save();

    const data = {
      user: {
        id: user._id,
      },
    };

    const token = jwt.sign(data, "secret-chatapp");
    res.json({
      token,
      username: user.username,
      email: user.email,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json({ errors: "Incorrect email or password" });
    }
    const passwordMatch = req.body.password === user.password;

    if (!passwordMatch) {
      return res.status(400).json({ errors: "Incorrect email or password" });
    }
    const data = {
      user: {
        id: user._id,
      },
    };
    const token = jwt.sign(data, "secret-chatapp");
    res.json({
      token,
      username: user.username,
      email: user.email,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/allusers", async (req, res) => {
  try {
    const users = await User.find({}, "username email");
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Conversation //

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
});

const Conversation = mongoose.model("Conversation", conversationSchema);

// Message //

const messageSchema = new mongoose.Schema({
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  message: { type: String, required: true },
});

const Message = mongoose.model("Message", messageSchema);

app.post("/sendmessage/:id", async (req, res) => {
  try {
    const receiver = req.params.id;
    const { message } = req.body;

    let conversation = await Conversation.findOne({
      participants: { $all: [receiver] },
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: [receiver],
      });
      await conversation.save();
    }

    const newMessage = new Message({
      receiver,
      message,
    });

    await newMessage.save();

    conversation.messages.push(newMessage._id);
    await conversation.save();

    io.emit("new_message", {
      receiver: newMessage.receiver,
      message: newMessage.message,
    });

    return res.json(newMessage);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/messages/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const messages = await Message.find({
      $or: [{ receiver: userId }],
    }).populate("receiver", "username email");

    return res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
