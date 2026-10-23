const mongoose=require("mongoose");
const initdata=require("./sampledata.js");
const touristplace=require("../models/destination.js");

const mongodb_url="mongodb://127.0.0.1:27017/tourist";

main().then(()=>{
    console.log("mongodb connected");
}).catch((err)=>{
    console.log(err);
})

async function main(){
    await mongoose.connect(mongodb_url);
}

const dataDB= async ()=>{
  // await  touristplace.deleteMany({ "district": "Pune"}); // to remo or clear data
//    initdata.data= initdata.data.map((obj)=>({...obj,owner:'6a736c8b3011e5d860f065d2'}))
  await  touristplace.insertMany(initdata);
  console.log("save");
  
}

dataDB();