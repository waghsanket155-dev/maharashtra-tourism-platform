const mongoose=require("mongoose");
const Schema=mongoose.Schema;
const { default: passportLocalMongoose } = require("passport-local-mongoose");

const userSchema= new Schema({
    email:{
        type:String,
        required:true
    },
   role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
}
})

userSchema.plugin(passportLocalMongoose); // it is aoutomatically creat username and password with salt and hash

module.exports = mongoose.model('User', userSchema);
