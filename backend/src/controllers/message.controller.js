import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import { hasImageKitConfig, uploadChatMedia } from "../lib/imagekit.js";

// get users for sidebar
export async function getUsersForSidebar(req, res){
    try{
        const loggedInUserId = req.user._id;

        const filteredUsers = await User.find({
            _id:{$ne: loggedInUserId}
        }).select("-clerkId");

        res.status(200).json(filteredUsers);

    }  catch (error) {
    console.error("Error in getUsersForSidebar:", error.message);
    res.status(500).json({ message: "Internal server error" });
    }
}



//get conversations for sidebar
export async function getConversationsForSidebar(req, res){
    try{
        const loggedInUserId = req.user._id;
        
        const conversations = await Message.aggregate([
     
      { $match: { $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }] } },
      
      {
        $group: {
          
          _id: { $cond: [{ $eq: ["$senderId", loggedInUserId] }, "$receiverId", "$senderId"] },
          lastMessageAt: { $max: "$createdAt" },
        },
      },
      
      { $sort: { lastMessageAt: -1 } },
     
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      
      { $replaceRoot: { newRoot: { $first: "$user" } } },
     
      { $project: { clerkId: 0 } },
    ]);

    res.status(200).json(conversations);
    } catch (error) {
    console.error("Error in getConversationsForSidebar:", error.message);
    res.status(500).json({ message: "Internal server error" });
    }
}



// get messages
export async function getMessages(req, res) {
    try{
        const { id: userToChatId } = req.params;
        const myId = req.user._id;

    const messages = await Message.find({
        $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
        ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
    } catch (error) {
    console.error("Error in getMessages:", error.message);
    res.status(500).json({ message: "Internal server error" });
    }
}



// send message
export async function sendMessage(req, res) {
    try {
        const { text } = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.user._id;

    let imageUrl;
    let videoUrl;

    if (req.file) {
      if (!hasImageKitConfig()) {
        return res.status(500).json({ message: "Media upload is not configured" });
        }

        const url = await uploadChatMedia(req.file);
        if (req.file.mimetype.startsWith("video/")) videoUrl = url;
        else imageUrl = url;
    }

    const newMessage = new Message({
        senderId,
        receiverId,
        text,
        image: imageUrl,
        video: videoUrl,
    });

    await newMessage.save();
    res.status(201).json(newMessage);

}
    catch (error) {
    console.error("Error in sendMessage:", error.message);
    res.status(500).json({ message: "Internal server error" });
    }
}

