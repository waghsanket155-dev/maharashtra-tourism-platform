
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});



const express=require("express");
const app=express();
const mongoose=require("mongoose");
const path= require("path");
const methodoverride= require("method-override");
const flash=require("connect-flash");
const ejsmate=require("ejs-mate");
const passport=require("passport");
const LocalStrategy=require("passport-local");
const session=require("express-session");
const User=require("./models/user.js");
const place=require("./models/destination.js");
const ManualPlanner=require("./models/manualPlanner.js");
const touristplace=require("./models/destination.js");
const SavedTrip=require("./models/savetrip.js");
const Incident=require("./models/incident.js");
const SafetyZone=require("./models/safetyZone.js");
const { seedSafetyZones }=require("./init/safetyZones.js");
const {isredirect,isAdmin ,isLoggedIn }=require("./middleware.js");
const axios = require("axios");
const aiplanner=require("./aiplanner.js");

app.engine("ejs",ejsmate);
app.set("view engine","ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(methodoverride("_method"));
app.use(express.static("public"));


const sessionoption = {
    // store:store,
    secret:"ndjfqejiofjew",
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 days
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        httpOnly: true
    }
};

app.use(session(sessionoption));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
// use static authenticate method of model in LocalStrategy
passport.use(new LocalStrategy(User.authenticate()));

// use static serialize and deserialize of model for passport session support
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req,res,next)=>{
    res.locals.successmsg=req.flash("success");
    res.locals.errormsg=req.flash("error");
    res.locals.currentlogin=req.user;
    next();
})


const mongo_url="mongodb://127.0.0.1:27017/tourist";
main().then(()=>{
    console.log("data connected");
    seedSafetyZones().catch(err => console.error("SafetyZone seed error:", err));
}).catch((err)=>{
    console.log(err);
})

async function main(){
    await mongoose.connect(mongo_url);
}

app.get(["/", "/home"], (req, res) => {
    res.render("tourism/index.ejs");
});

app.get("/manual-planner", (req, res) => {
    res.redirect("/m-planner");
});

app.get("/explore",async(req,res)=>{
   let data= await touristplace.find({});
     res.render ("tourism/explore.ejs",{data});
})

app.get(["/planner", "/ai-planner"], isLoggedIn, (req, res) => {
    res.render("tourism/planner.ejs");
});

// Booking route redirect to official MTDC portal
app.get("/booking", (req, res) => {
    res.redirect("https://www.mtdc.co/");
});

// Guides redirect to destinations explore
app.get("/guides", (req, res) => {
    res.redirect("/explore");
});

// Tourist ID redirect to safety
app.get("/tourist-id", isLoggedIn, (req, res) => {
    res.redirect("/safety");
});

// About page
app.get("/about", (req, res) => {
  res.render("tourism/about.ejs");
});

// user route

app.get("/signup",(req,res)=>{
    res.render("user/signup.ejs")
})

app.post("/signup",async(req,res)=>{
    try{let { username, email, password}=req.body;
    const adduser=new User({
        username,
        email
    })

    const registeruser= await User.register(adduser,password);
    req.login(registeruser,(err)=>{
        if(err){
            return next(err);
        }
         req.flash("success","user register successfully");
    res.redirect("/home");
    })
}catch(error){
    req.flash("error",error.message);
    res.redirect("/signup");
}
})

app.get("/login",(req,res)=>{
    res.render("user/login.ejs");
})

app.post("/login",isredirect,
  passport.authenticate('local', { failureRedirect: '/login' , failureFlash:true }),
  function(req, res) {
    req.flash("success","Welcome back to maharashtra");
    let redirectvariable=res.locals.redirectUrl || "/home";
    res.redirect(redirectvariable);
  }
);

app.get("/logout",(req,res,next)=>{
    req.logOut((err)=>{
        if(err){
            return next(err);
        }
        req.flash("success","user Logout successfully");
        res.redirect("/explore");
    })
  })
//   footer

app.get("/privacy",(req,res)=>{
    res.render("footer/privacy.ejs");
})

app.get("/term",(req,res)=>{
    res.render("footer/term.ejs");
})

// ==========================================
// ADMIN DASHBOARD & MANAGEMENT ROUTES
// ==========================================

// 1. Admin Dashboard
app.get("/dashboard", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const totalPlaces = await place.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalIncidents = await Incident.countDocuments();
    const totalSafetyZones = await SafetyZone.countDocuments();
    const pendingSafetyZones = await SafetyZone.countDocuments({ verificationStatus: "pending" });
    const totalBookings = await SavedTrip.countDocuments();

    res.render("admin/dashboard.ejs", {
      totalPlaces,
      totalUsers,
      totalBookings,
      totalIncidents,
      totalSafetyZones,
      pendingSafetyZones
    });
  } catch (err) {
    console.error("ADMIN DASHBOARD ERROR:", err);
    req.flash("error", "Unable to load admin dashboard.");
    res.redirect("/");
  }
});

// 2. Manage Places (Directory, Filter & Search)
app.get(["/places", "/admin/places"], isLoggedIn, isAdmin, async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const category = (req.query.category || "all").trim();

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { district: { $regex: search, $options: "i" } }
      ];
    }
    if (category && category !== "all") {
      filter.category = category;
    }

    const places = await place.find(filter).sort({ name: 1 });
    const totalPlaces = await place.countDocuments();
    const totalDistricts = (await place.distinct("district")).length;
    const categoriesList = await place.distinct("category");
    const geofencedCount = await place.countDocuments({ "geoFence.enabled": true });

    const allCategories = [
      "Historical", "Religious", "Nature", "Wildlife", "Park / Garden",
      "Museum", "Beach", "Adventure", "Family", "Park / Family",
      "Leisure", "Trekking", "Wellness", "Cultural", "Hill Station"
    ];

    res.render("admin/places.ejs", {
      places,
      totalPlaces,
      totalDistricts,
      categoriesCount: categoriesList.length,
      geofencedCount,
      allCategories,
      currentCategory: category,
      search
    });
  } catch (err) {
    console.error("ADMIN PLACES ERROR:", err);
    req.flash("error", "Unable to load destinations directory.");
    res.redirect("/dashboard");
  }
});

// 3. New Place Form
app.get(["/admin/new", "/places/new"], isLoggedIn, isAdmin, (req, res) => {
  res.render("admin/new.ejs");
});

// 4. Create New Place
app.post(["/places", "/touristplaces"], isLoggedIn, isAdmin, async (req, res) => {
  try {
    const body = req.body.touristPlace || req.body;
    const { name, district, category, description } = body;

    if (!name || !district || !category || !description) {
      req.flash("error", "Please provide all required fields (Name, District, Category, Description).");
      return res.redirect("/admin/new");
    }

    // Process images
    let images = [];
    if (Array.isArray(body.images)) {
      images = body.images.filter(img => typeof img === "string" && img.trim());
    } else if (typeof body.images === "string" && body.images.trim()) {
      images = body.images.split(",").map(img => img.trim()).filter(Boolean);
    }
    if (images.length === 0) {
      images = ["https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&w=1200&q=80"];
    }

    // Process activities
    let activities = [];
    if (Array.isArray(body.activities)) {
      activities = body.activities;
    } else if (typeof body.activities === "string" && body.activities.trim()) {
      activities = body.activities.split(",").map(a => a.trim()).filter(Boolean);
    }

    // Process nearby places
    let nearbyPlaces = [];
    if (Array.isArray(body.nearbyPlaces)) {
      nearbyPlaces = body.nearbyPlaces;
    } else if (typeof body.nearbyPlaces === "string" && body.nearbyPlaces.trim()) {
      nearbyPlaces = body.nearbyPlaces.split(",").map(p => p.trim()).filter(Boolean);
    }

    // Location
    const location = {
      address: body.location?.address || body.address || "",
      latitude: Number(body.location?.latitude ?? body.latitude ?? 0) || 0,
      longitude: Number(body.location?.longitude ?? body.longitude ?? 0) || 0
    };

    // Entry Fee
    const entryFee = {
      indian: Number(body.entryFee?.indian ?? body.entryFeeIndian ?? 0) || null,
      foreign: Number(body.entryFee?.foreign ?? body.entryFeeForeign ?? 0) || null,
      currency: body.entryFee?.currency || body.currency || "INR",
      notes: body.entryFee?.notes || body.feeNotes || ""
    };

    // GeoFence
    const geoFence = {
      enabled: body.geoFence?.enabled === "true" || body.geoFence?.enabled === true || body.geoFence?.enabled === "on",
      radius: Number(body.geoFence?.radius ?? 500) || 500,
      zoneType: body.geoFence?.zoneType || "tourist_area",
      status: body.geoFence?.status || "unverified",
      restrictedReason: body.geoFence?.restrictedReason || ""
    };

    const newPlace = new place({
      name: name.trim(),
      district: district.trim(),
      category: category.trim(),
      description: description.trim(),
      images,
      location,
      rating: body.rating ? Number(body.rating) : 4.0,
      bestTime: body.bestTime || null,
      openingTime: body.openingTime || null,
      closingTime: body.closingTime || null,
      entryFee,
      activities,
      nearbyPlaces,
      geoFence,
      author: req.user?._id
    });

    await newPlace.save();
    req.flash("success", `Tourist destination "${newPlace.name}" added successfully!`);
    res.redirect("/places");
  } catch (err) {
    console.error("CREATE PLACE ERROR:", err);
    req.flash("error", "Failed to add destination. " + (err.message || ""));
    res.redirect("/admin/new");
  }
});

// 5. Edit Place Form
app.get(["/places/:id/edit", "/admin/places/:id/edit"], isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid destination ID.");
      return res.redirect("/places");
    }

    const foundPlace = await place.findById(id);
    if (!foundPlace) {
      req.flash("error", "Tourist destination not found.");
      return res.redirect("/places");
    }

    res.render("admin/editPlace.ejs", { place: foundPlace });
  } catch (err) {
    console.error("EDIT PLACE FORM ERROR:", err);
    req.flash("error", "Unable to load edit page.");
    res.redirect("/places");
  }
});

// 6. Update Place (Handles POST and PUT)
const updatePlaceHandler = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid destination ID.");
      return res.redirect("/places");
    }

    const foundPlace = await place.findById(id);
    if (!foundPlace) {
      req.flash("error", "Destination not found.");
      return res.redirect("/places");
    }

    const body = req.body.touristPlace || req.body;
    if (body.name) foundPlace.name = body.name.trim();
    if (body.district) foundPlace.district = body.district.trim();
    if (body.category) foundPlace.category = body.category.trim();
    if (body.description) foundPlace.description = body.description.trim();

    if (body.images) {
      if (Array.isArray(body.images)) {
        foundPlace.images = body.images.filter(img => typeof img === "string" && img.trim());
      } else if (typeof body.images === "string" && body.images.trim()) {
        foundPlace.images = body.images.split(",").map(img => img.trim()).filter(Boolean);
      }
    }

    if (body.rating !== undefined && body.rating !== "") {
      foundPlace.rating = Number(body.rating);
    }

    if (!foundPlace.location) foundPlace.location = {};
    if (body.address || body.location?.address) {
      foundPlace.location.address = body.address || body.location.address;
    }
    if (body.latitude !== undefined || body.location?.latitude !== undefined) {
      foundPlace.location.latitude = Number(body.latitude ?? body.location?.latitude ?? 0);
    }
    if (body.longitude !== undefined || body.location?.longitude !== undefined) {
      foundPlace.location.longitude = Number(body.longitude ?? body.location?.longitude ?? 0);
    }

    if (body.bestTime !== undefined) foundPlace.bestTime = body.bestTime;
    if (body.openingTime !== undefined) foundPlace.openingTime = body.openingTime;
    if (body.closingTime !== undefined) foundPlace.closingTime = body.closingTime;

    if (!foundPlace.entryFee) foundPlace.entryFee = {};
    if (body.entryFeeIndian !== undefined || body.entryFee?.indian !== undefined) {
      foundPlace.entryFee.indian = Number(body.entryFeeIndian ?? body.entryFee?.indian);
    }
    if (body.entryFeeForeign !== undefined || body.entryFee?.foreign !== undefined) {
      foundPlace.entryFee.foreign = Number(body.entryFeeForeign ?? body.entryFee?.foreign);
    }

    await foundPlace.save();
    req.flash("success", `Destination "${foundPlace.name}" updated successfully.`);
    res.redirect("/places");
  } catch (err) {
    console.error("UPDATE PLACE ERROR:", err);
    req.flash("error", "Failed to update destination: " + (err.message || ""));
    res.redirect("/places");
  }
};

app.post("/places/:id", isLoggedIn, isAdmin, updatePlaceHandler);
app.put("/places/:id", isLoggedIn, isAdmin, updatePlaceHandler);

// 7. Delete Place
app.post("/places/:id/delete", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid destination ID.");
      return res.redirect("/places");
    }

    const deleted = await place.findByIdAndDelete(id);
    if (!deleted) {
      req.flash("error", "Destination not found.");
      return res.redirect("/places");
    }

    req.flash("success", `Destination "${deleted.name}" has been deleted.`);
    res.redirect("/places");
  } catch (err) {
    console.error("DELETE PLACE ERROR:", err);
    req.flash("error", "Failed to delete destination.");
    res.redirect("/places");
  }
});

app.delete("/places/:id", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await place.findByIdAndDelete(id);
    req.flash("success", "Destination deleted.");
    res.redirect("/places");
  } catch (err) {
    req.flash("error", "Failed to delete destination.");
    res.redirect("/places");
  }
});

// View Place Redirect
app.get("/places/:id", (req, res) => {
  res.redirect("/touristplaces/" + req.params.id);
});

// 8. User Management (Directory, Filter, Search)
app.get("/admin/users", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const role = (req.query.role || "all").trim();

    const filter = {};
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }
    if (role && role !== "all") {
      filter.role = role;
    }

    const users = await User.find(filter).sort({ _id: -1 });
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: "admin" });
    const regularUsersCount = totalUsers - adminCount;

    res.render("admin/users.ejs", {
      users,
      totalUsers,
      adminCount,
      regularUsersCount,
      currentRole: role,
      search
    });
  } catch (err) {
    console.error("ADMIN USERS ERROR:", err);
    req.flash("error", "Unable to load user management.");
    res.redirect("/dashboard");
  }
});

// 9. Update User Role
app.post("/admin/users/:id/role", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid user ID.");
      return res.redirect("/admin/users");
    }

    if (req.user._id.toString() === id) {
      req.flash("error", "You cannot modify your own administrative role.");
      return res.redirect("/admin/users");
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      req.flash("error", "User not found.");
      return res.redirect("/admin/users");
    }

    const newRole = req.body.role === "admin" ? "admin" : "user";
    targetUser.role = newRole;
    await targetUser.save();

    req.flash("success", `User "${targetUser.username}" role updated to ${newRole}.`);
    res.redirect("/admin/users");
  } catch (err) {
    console.error("ADMIN USER ROLE ERROR:", err);
    req.flash("error", "Failed to update user role.");
    res.redirect("/admin/users");
  }
});

// 10. Delete User
app.post("/admin/users/:id/delete", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      req.flash("error", "Invalid user ID.");
      return res.redirect("/admin/users");
    }

    if (req.user._id.toString() === id) {
      req.flash("error", "You cannot delete your own admin account.");
      return res.redirect("/admin/users");
    }

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      req.flash("error", "User not found.");
      return res.redirect("/admin/users");
    }

    req.flash("success", `User "${deletedUser.username}" account deleted successfully.`);
    res.redirect("/admin/users");
  } catch (err) {
    console.error("ADMIN USER DELETE ERROR:", err);
    req.flash("error", "Failed to delete user.");
    res.redirect("/admin/users");
  }
});

// ai trip planer



app.post("/plan-trip",isLoggedIn , aiplanner);


app.get(["/touristplaces/:id", "/places/:id/view"], isLoggedIn, async (req, res) => {
  try {
    const data = await place.findById(req.params.id).populate("author");
    if (!data) {
      req.flash("error", "Destination not found.");
      return res.redirect("/explore");
    }
    res.render("tourism/show.ejs", { place: data });
  } catch (err) {
    console.error("Error fetching tourist place:", err);
    req.flash("error", "Failed to retrieve destination details.");
    res.redirect("/explore");
  }
});



app.post("/save-trip", isLoggedIn, async (req, res) => {

  try {

    let { itinerary } = req.body;

    // -----------------------------
    // 1. Check itinerary
    // -----------------------------

    if (!itinerary) {

      req.flash(
        "error",
        "Trip data missing."
      );

      return res.redirect("/plan-trip");
    }


    // -----------------------------
    // 2. Convert itinerary string
    //    into JavaScript object
    // -----------------------------

    if (typeof itinerary === "string") {

      itinerary = JSON.parse(itinerary);

    }


    // -----------------------------
    // 3. Validate days
    // -----------------------------

    if (
      !itinerary.days ||
      !Array.isArray(itinerary.days)
    ) {

      req.flash(
        "error",
        "Invalid trip days."
      );

      return res.redirect("/plan-trip");
    }


    // -----------------------------
    // 4. Fix activities
    // -----------------------------

    const cleanedDays = itinerary.days.map(day => {

      let activities = day.activities || [];


      // If activities is JSON/string
      if (typeof activities === "string") {

        try {

          activities = JSON.parse(activities);

        } catch (error) {

          console.error(
            "ACTIVITIES JSON ERROR:",
            error
          );

          activities = [];

        }

      }


      // Make sure activities is array
      if (!Array.isArray(activities)) {

        activities = [];

      }


      return {

        day: Number(day.day) || 1,

        title: day.title || "",

        activities: activities.map(activity => ({

          time: activity.time || "",

          type: activity.type || "",

          from: activity.from || "",

          to: activity.to || "",

          place: activity.place || "",

          placeId: (activity.placeId && mongoose.Types.ObjectId.isValid(activity.placeId)) ? activity.placeId : undefined,

          duration: activity.duration || "",

          description: activity.description || ""

        }))

      };

    });


    // -----------------------------
    // 5. Clean estimated cost
    // -----------------------------

    const estimatedCost = {

      travel:
        itinerary.estimatedCost?.travel ||
        "0",

      food:
        itinerary.estimatedCost?.food ||
        "0",

      entryFees:
        itinerary.estimatedCost?.entryFees ||
        "0",

      total:
        itinerary.estimatedCost?.total ||
        "0"

    };


    // -----------------------------
    // 6. Create Saved Trip
    // -----------------------------

    const savedTrip =
      await SavedTrip.create({

        user: req.user._id,

        summary:
          itinerary.summary || "",

        days: cleanedDays,

        estimatedCost

      });


    // -----------------------------
    // 7. Success
    // -----------------------------

    console.log(
      "TRIP SAVED SUCCESSFULLY:",
      savedTrip._id
    );


    req.flash(
      "success",
      "Trip saved successfully ❤️"
    );


    return res.redirect(
      "/my-trips"
    );


  } catch (error) {

    console.error(
      "SAVE TRIP ERROR:",
      error
    );


    req.flash(
      "error",
      "Failed to save trip."
    );


    return res.redirect(
      "/plan-trip"
    );

  }

});




app.get(["/my-trips", "/mytrips"], isLoggedIn, async (req, res) => {

  try {

    const trips = await SavedTrip
      .find({
        user: req.user._id
      })
      .sort({
        createdAt: -1
      });

    res.render("tourism/mytrips.ejs", {
      trips
    });

  } catch (error) {

    console.error("MY TRIPS ERROR:", error);

    req.flash("error", "Unable to load saved trips.");
    return res.redirect("/plan-trip");

  }

});


app.get("/my-trips/:id", isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const trip = await SavedTrip.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!trip) {
      req.flash("error", "Trip not found.");
      return res.redirect("/my-trips");
    }

    res.render("tourism/tripresult.ejs", {
      itinerary: trip,
      isSaved: true
    });

  } catch (error) {
    console.error("VIEW SAVED TRIP ERROR:", error);
    req.flash("error", "Unable to load trip.");
    return res.redirect("/my-trips");
  }
});

// Edit existing saved manual trip
app.get("/my-trips/:id/edit", isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const trip = await SavedTrip.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!trip) {
      req.flash("error", "Trip not found or unauthorized.");
      return res.redirect("/my-trips");
    }

    const plannerPlaces = await ManualPlanner
      .find({ user_id: req.user._id })
      .populate("destination_id")
      .sort({ createdAt: -1 });

    const allDestinations = await touristplace.find({}).sort({ name: 1 });
    const categories = [...new Set(allDestinations.map(d => d.category).filter(Boolean))].sort();
    const districts = [...new Set(allDestinations.map(d => d.district).filter(Boolean))].sort();

    res.render("tourism/mplanner.ejs", {
      plannerPlaces: plannerPlaces.filter(p => p.destination_id),
      allDestinations,
      categories,
      districts,
      tripToEdit: trip
    });

  } catch (error) {
    console.error("EDIT TRIP GET ERROR:", error);
    req.flash("error", "Unable to load trip editor.");
    res.redirect("/my-trips");
  }
});

// Update existing saved manual trip
app.put("/my-trips/:id", isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const trip = await SavedTrip.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!trip) {
      req.flash("error", "Trip not found or unauthorized.");
      return res.redirect("/my-trips");
    }

    let payload = req.body;
    if (req.body.itineraryPayload) {
      try {
        payload = JSON.parse(req.body.itineraryPayload);
      } catch (e) {
        console.error("PAYLOAD JSON PARSE ERROR:", e);
      }
    }

    const { tripName, startingCity, startDate, travelers, budget, notes, summary, days } = payload;

    if (!tripName || !startingCity || !startDate) {
      req.flash("error", "Please provide all required trip details.");
      return res.redirect(`/my-trips/${req.params.id}/edit`);
    }

    if (!days || !Array.isArray(days) || days.length === 0) {
      req.flash("error", "Trip must have at least one day.");
      return res.redirect(`/my-trips/${req.params.id}/edit`);
    }

    let grandTransport = 0;
    let grandFood = 0;
    let grandEntry = 0;
    let grandOther = 0;

    const cleanedDays = days.map((day, idx) => {
      const activities = (day.activities || []).map(act => {
        const tCost = Math.max(0, Number(act.transportCost) || 0);
        const fCost = Math.max(0, Number(act.foodCost) || 0);
        const eCost = Math.max(0, Number(act.entryFee) || 0);
        const oCost = Math.max(0, Number(act.otherCost) || 0);

        grandTransport += tCost;
        grandFood += fCost;
        grandEntry += eCost;
        grandOther += oCost;

        return {
          time: act.time || act.arrivalTime || "",
          arrivalTime: act.arrivalTime || act.time || "",
          departureTime: act.departureTime || "",
          type: act.type || "visit",
          from: act.from || "",
          to: act.to || "",
          place: act.place || "Stop",
          placeId: (act.placeId && mongoose.Types.ObjectId.isValid(act.placeId)) ? act.placeId : undefined,
          duration: act.duration || "",
          description: act.description || act.notes || "",
          notes: act.notes || act.description || "",
          transportMode: act.transportMode || "",
          transportCost: tCost,
          entryFee: eCost,
          foodCost: fCost,
          otherCost: oCost
        };
      });

      return {
        day: Number(day.day) || (idx + 1),
        date: day.date || "",
        title: day.title || `Day ${idx + 1}`,
        activities
      };
    });

    const grandTotal = grandTransport + grandFood + grandEntry + grandOther;

    trip.tripName = tripName.trim();
    trip.title = tripName.trim();
    trip.startingCity = startingCity.trim();
    trip.startDate = startDate;
    trip.travelers = Math.max(1, Number(travelers) || 1);
    trip.budget = Math.max(0, Number(budget) || 0);
    trip.notes = notes ? notes.trim() : "";
    trip.summary = summary ? summary.trim() : `${cleanedDays.length}-day trip from ${startingCity} exploring Maharashtra destinations, for ${travelers} traveler(s) with an estimated cost of ₹${grandTotal.toLocaleString('en-IN')}.`;
    trip.days = cleanedDays;
    trip.estimatedCost = {
      travel: grandTransport,
      food: grandFood,
      entryFees: grandEntry,
      other: grandOther,
      total: grandTotal
    };

    await trip.save();

    console.log("TRIP UPDATED SUCCESSFULLY:", trip._id);
    req.flash("success", "Trip updated successfully! ❤️");
    return res.redirect(`/my-trips/${trip._id}`);

  } catch (error) {
    console.error("UPDATE TRIP ERROR:", error);
    req.flash("error", "Failed to update trip.");
    return res.redirect(`/my-trips/${req.params.id}/edit`);
  }
});

// Delete saved trip
app.delete("/my-trips/:id", isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid trip ID.");
      return res.redirect("/my-trips");
    }

    const deletedTrip = await SavedTrip.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });

    if (!deletedTrip) {
      req.flash("error", "Trip not found or unauthorized.");
      return res.redirect("/my-trips");
    }

    req.flash("success", "Trip deleted successfully!");
    res.redirect("/my-trips");
  } catch (error) {
    console.error("DELETE SAVED TRIP ERROR:", error);
    req.flash("error", "Failed to delete trip.");
    res.redirect("/my-trips");
  }
});


// ==============================
// MANUAL TRIP PLANNER ROUTES
// ==============================

// Helper API to fetch destination details
app.get("/api/destinations", async (req, res) => {
  try {
    const places = await touristplace.find({}, "name district category images entryFee rating description").sort({ name: 1 });
    res.json(places);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch destinations" });
  }
});

// Save complete manual trip to MongoDB
app.post("/save-manual-trip", isLoggedIn, async (req, res) => {
  try {
    let payload = req.body;
    if (req.body.itineraryPayload) {
      try {
        payload = JSON.parse(req.body.itineraryPayload);
      } catch (e) {
        console.error("PAYLOAD PARSE ERROR:", e);
      }
    }

    const { tripName, startingCity, startDate, travelers, budget, notes, summary, days } = payload;

    if (!tripName || !startingCity || !startDate) {
      req.flash("error", "Please provide all required trip details.");
      return res.redirect("/m-planner");
    }

    if (!days || !Array.isArray(days) || days.length === 0) {
      req.flash("error", "Trip must have at least one day.");
      return res.redirect("/m-planner");
    }

    let grandTransport = 0;
    let grandFood = 0;
    let grandEntry = 0;
    let grandOther = 0;
    let totalActivitiesCount = 0;

    const cleanedDays = days.map((day, idx) => {
      const activities = (day.activities || []).map(act => {
        const tCost = Math.max(0, Number(act.transportCost) || 0);
        const fCost = Math.max(0, Number(act.foodCost) || 0);
        const eCost = Math.max(0, Number(act.entryFee) || 0);
        const oCost = Math.max(0, Number(act.otherCost) || 0);

        grandTransport += tCost;
        grandFood += fCost;
        grandEntry += eCost;
        grandOther += oCost;
        totalActivitiesCount++;

        return {
          time: act.time || act.arrivalTime || "",
          arrivalTime: act.arrivalTime || act.time || "",
          departureTime: act.departureTime || "",
          type: act.type || "visit",
          from: act.from || "",
          to: act.to || "",
          place: act.place || "Stop",
          placeId: (act.placeId && mongoose.Types.ObjectId.isValid(act.placeId)) ? act.placeId : undefined,
          duration: act.duration || "",
          description: act.description || act.notes || "",
          notes: act.notes || act.description || "",
          transportMode: act.transportMode || "",
          transportCost: tCost,
          entryFee: eCost,
          foodCost: fCost,
          otherCost: oCost
        };
      });

      return {
        day: Number(day.day) || (idx + 1),
        date: day.date || "",
        title: day.title || `Day ${idx + 1}`,
        activities
      };
    });

    if (totalActivitiesCount === 0) {
      req.flash("error", "Please add at least one stop or activity to your itinerary.");
      return res.redirect("/m-planner");
    }

    const grandTotal = grandTransport + grandFood + grandEntry + grandOther;

    const savedTrip = await SavedTrip.create({
      user: req.user._id,
      tripName: tripName.trim(),
      title: tripName.trim(),
      tripType: "manual",
      startingCity: startingCity.trim(),
      startDate: startDate,
      travelers: Math.max(1, Number(travelers) || 1),
      budget: Math.max(0, Number(budget) || 0),
      notes: notes ? notes.trim() : "",
      summary: summary ? summary.trim() : `${cleanedDays.length}-day trip from ${startingCity} exploring Maharashtra destinations, for ${travelers} traveler(s) with an estimated cost of ₹${grandTotal.toLocaleString('en-IN')}.`,
      days: cleanedDays,
      estimatedCost: {
        travel: grandTransport,
        food: grandFood,
        entryFees: grandEntry,
        other: grandOther,
        total: grandTotal
      }
    });

    console.log("MANUAL TRIP SAVED TO MONGODB SUCCESSFULLY:", savedTrip._id);
    req.flash("success", "Trip saved successfully to My Trips ❤️");
    return res.redirect("/my-trips");

  } catch (error) {
    console.error("SAVE MANUAL TRIP ERROR:", error);
    req.flash("error", "Failed to save trip.");
    return res.redirect("/m-planner");
  }
});

// View Manual Planner
app.get("/m-planner", isLoggedIn, async (req, res) => {
  try {
    const plannerPlaces = await ManualPlanner
      .find({ user_id: req.user._id })
      .populate("destination_id")
      .sort({ createdAt: -1 });

    const allDestinations = await touristplace.find({}).sort({ name: 1 });
    const categories = [...new Set(allDestinations.map(d => d.category).filter(Boolean))].sort();
    const districts = [...new Set(allDestinations.map(d => d.district).filter(Boolean))].sort();

    res.render("tourism/mplanner.ejs", {
      plannerPlaces: plannerPlaces.filter(p => p.destination_id),
      allDestinations,
      categories,
      districts,
      tripToEdit: null
    });

  } catch (err) {
    console.error("VIEW MANUAL PLANNER ERROR:", err);
    req.flash("error", "Unable to load your planner.");
    res.redirect("/explore");
  }
});

// Add destination from Explore or Planner (POST)
app.post(
  "/m-planner/:destinationId",
  isLoggedIn,
  async (req, res) => {
    try {
      const { destinationId } = req.params;

      // Validate destination ID
      if (!mongoose.Types.ObjectId.isValid(destinationId)) {
        req.flash("error", "Invalid destination.");
        return res.redirect("/explore");
      }

      // Check whether destination exists
      const destination = await touristplace.findById(destinationId);

      if (!destination) {
        req.flash("error", "Destination not found.");
        return res.redirect("/explore");
      }

      // Avoid duplicate destinations for the same user
      const alreadyAdded = await ManualPlanner.findOne({
        user_id: req.user._id,
        destination_id: destinationId
      });

      if (alreadyAdded) {
        req.flash("error", "This destination is already in your planner.");
        const referer = req.headers.referer || "";
        return res.redirect(referer.includes("/explore") ? "/explore" : "/m-planner");
      }

      await ManualPlanner.create({
        user_id: req.user._id,
        destination_id: destinationId
      });

      req.flash("success", "Destination added to your planner!");
      return res.redirect("/m-planner");

    } catch (err) {
      console.error("ADD MANUAL PLANNER ERROR:", err);
      req.flash("error", "Unable to add destination.");
      return res.redirect("/explore");
    }
  }
);

// Backward-compatible GET route for adding or viewing destination to satisfy existing tests/links
app.get(
  "/m-planner/:destinationId",
  isLoggedIn,
  async (req, res) => {
    try {
      const { destinationId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(destinationId)) {
        req.flash("error", "Invalid destination.");
        return res.redirect("/explore");
      }

      const destination = await touristplace.findById(destinationId);
      if (!destination) {
        req.flash("error", "Destination not found.");
        return res.redirect("/explore");
      }

      const alreadyAdded = await ManualPlanner.findOne({
        user_id: req.user._id,
        destination_id: destinationId
      });

      if (!alreadyAdded) {
        await ManualPlanner.create({
          user_id: req.user._id,
          destination_id: destinationId
        });
        req.flash("success", "Destination added to your planner!");
      }

      return res.redirect("/explore");
    } catch (err) {
      console.error("GET ADD MANUAL PLANNER ERROR:", err);
      req.flash("error", "Unable to add destination.");
      return res.redirect("/explore");
    }
  }
);

// Remove destination from Manual Planner
app.delete(
  "/m-planner/:destinationId",
  isLoggedIn,
  async (req, res) => {
    try {
      const { destinationId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(destinationId)) {
        req.flash("error", "Invalid destination.");
        return res.redirect("/m-planner");
      }

      const deletedPlanner = await ManualPlanner.findOneAndDelete({
        user_id: req.user._id,
        destination_id: destinationId
      });

      if (!deletedPlanner) {
        req.flash("error", "Destination not found in your planner.");
        return res.redirect("/m-planner");
      }

      req.flash("success", "Destination removed from your planner.");
      return res.redirect("/m-planner");

    } catch (err) {
      console.error("REMOVE PLANNER DESTINATION ERROR:", err);
      req.flash("error", "Unable to remove destination.");
      return res.redirect("/m-planner");
    }
  }
);

// Alias DELETE route for test/backwards compatibility
app.delete(
  "/touristplaces/:destinationId",
  isLoggedIn,
  async (req, res) => {
    try {
      const { destinationId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(destinationId)) {
        req.flash("error", "Invalid destination.");
        return res.redirect("/m-planner");
      }

      await ManualPlanner.findOneAndDelete({
        user_id: req.user._id,
        destination_id: destinationId
      });

      req.flash("success", "Destination removed from your planner.");
      return res.redirect("/m-planner");
    } catch (err) {
      console.error("REMOVE PLANNER ALIAS ERROR:", err);
      return res.redirect("/m-planner");
    }
  }
);

// ==========================================
// TOURIST SAFETY, GEOFENCING & INCIDENT ROUTES
// ==========================================

// In-memory rate limiting map for SOS incident submissions (Requirement 6 & 7)
const incidentSubmissionHistory = new Map();

function isSosRateLimited(userId, ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000; // 10 minutes window
  const maxLimit = 5; // Max 5 reports per 10 minutes

  const key = `${userId || 'anon'}_${ip || 'unknown'}`;
  const timestamps = incidentSubmissionHistory.get(key) || [];
  const validTimestamps = timestamps.filter(t => now - t < windowMs);

  if (validTimestamps.length >= maxLimit) {
    return true;
  }

  validTimestamps.push(now);
  incidentSubmissionHistory.set(key, validTimestamps);
  return false;
}

// 1. Tourist Safety Dashboard
app.get("/safety", isLoggedIn, async (req, res) => {
  res.render("tourism/safety.ejs");
});

// 2. Fetch Geo-Fence zones for client-side evaluation
app.get("/api/safety/geofences", isLoggedIn, async (req, res) => {
  try {
    // Return only active, verified, and currently valid zones (Feature 4)
    const activeZones = await SafetyZone.findActiveVerified().lean();

    const zones = activeZones
      .map(z => ({
        id: z._id.toString(),
        _id: z._id.toString(),
        name: z.name,
        title: z.name,
        district: z.district || "",
        category: z.zoneType,
        latitude: Number(z.latitude),
        longitude: Number(z.longitude),
        radius: Number(z.radius),
        zoneType: z.zoneType,
        status: z.verificationStatus,
        verificationStatus: z.verificationStatus,
        restrictedReason: z.restrictedReason || "",
        sourceName: z.sourceName || "",
        sourceUrl: z.sourceUrl || "",
        notificationNumber: z.notificationNumber || "",
        geometry: z.geometry || null
      }))
      .filter(z => !isNaN(z.latitude) && !isNaN(z.longitude) && z.radius > 0);

    if (req.query.format === "array") {
      return res.json(zones);
    }

    res.json({
      success: true,
      count: zones.length,
      zones
    });
  } catch (err) {
    console.error("GEOFENCE API ERROR:", err);
    res.status(500).json({ success: false, error: "Failed to load safety zones." });
  }
});

// 3. Create SOS Incident Report
app.post("/incidents", isLoggedIn, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const userIp = req.ip || req.connection?.remoteAddress || "";

    // Rate Limiting Check
    if (isSosRateLimited(userId, userIp)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(429).json({
          success: false,
          error: "Too many incident reports submitted. Please wait before submitting again. For immediate danger, call 112 directly."
        });
      }
      req.flash("error", "Too many reports submitted. Please wait. For immediate emergencies, call 112.");
      return res.redirect("/safety");
    }

    const { incidentType, description, phone, userPhone, alternateContact, locationConsent, latitude, longitude, accuracy, capturedAt, address } = req.body;

    // Validate Incident Type
    const validTypes = [
      "medical_emergency",
      "lost_tourist",
      "harassment_safety",
      "accident_injury",
      "unsafe_restricted_area",
      "lost_belongings",
      "other"
    ];

    if (!incidentType || !validTypes.includes(incidentType)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Invalid incident category." });
      }
      req.flash("error", "Invalid incident category.");
      return res.redirect("/safety");
    }

    // Validate Description
    if (!description || typeof description !== "string" || description.trim().length < 5) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Description must be at least 5 characters long." });
      }
      req.flash("error", "Description must be at least 5 characters long.");
      return res.redirect("/safety");
    }

    const hasLocationConsent = locationConsent === true || locationConsent === "true" || locationConsent === "on";

    // Validate optional location coordinates if consent was given
    const locationData = {
      address: hasLocationConsent && typeof address === "string" ? address.trim() : "",
      latitude: null,
      longitude: null,
      accuracy: null,
      capturedAt: null
    };

    if (hasLocationConsent && latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
      const latNum = Number(latitude);
      const lngNum = Number(longitude);
      const accNum = accuracy !== undefined && accuracy !== null ? Number(accuracy) : null;

      if (!isNaN(latNum) && !isNaN(lngNum) && latNum >= -90 && latNum <= 90 && lngNum >= -180 && lngNum <= 180) {
        locationData.latitude = latNum;
        locationData.longitude = lngNum;
        locationData.accuracy = (!isNaN(accNum) && accNum >= 0) ? accNum : null;
        locationData.capturedAt = capturedAt ? new Date(capturedAt) : new Date();
      }
    }

    const reportId = Incident.generateReportId();

    const newIncident = await Incident.create({
      reportId,
      user: req.user._id,
      incidentType,
      description: description.trim(),
      locationConsent: hasLocationConsent && locationData.latitude !== null,
      location: locationData,
      userName: req.user.username || "",
      userEmail: req.user.email || "",
      userPhone: typeof userPhone === "string" ? userPhone.trim() : (typeof phone === "string" ? phone.trim() : ""),
      contactInfo: {
        phone: typeof userPhone === "string" ? userPhone.trim() : (typeof phone === "string" ? phone.trim() : ""),
        alternateContact: typeof alternateContact === "string" ? alternateContact.trim() : ""
      },
      status: "Pending",
      ipAddress: userIp
    });

    console.log(`INCIDENT REPORT CREATED [${reportId}] by user ${req.user._id}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(201).json({
        success: true,
        reportId: newIncident.reportId,
        id: newIncident._id,
        message: "Incident report submitted successfully."
      });
    }

    req.flash("success", `Incident report ${reportId} submitted successfully.`);
    return res.redirect("/my-incidents");

  } catch (err) {
    console.error("CREATE INCIDENT ERROR:", err);
    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.status(500).json({ success: false, error: "Server error creating incident report." });
    }
    req.flash("error", "Unable to submit incident report. For emergencies, call 112.");
    return res.redirect("/safety");
  }
});

// 4. View User's Own Incidents
app.get("/my-incidents", isLoggedIn, async (req, res) => {
  try {
    const incidents = await Incident.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    res.render("tourism/myincidents.ejs", { incidents });
  } catch (err) {
    console.error("GET MY INCIDENTS ERROR:", err);
    req.flash("error", "Unable to load your incident reports.");
    res.redirect("/safety");
  }
});

// 5. View Specific User Incident Details
app.get("/my-incidents/:id", isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid report ID.");
      return res.redirect("/my-incidents");
    }

    const incident = await Incident.findOne({
      _id: req.params.id,
      user: req.user._id
    }).lean();

    if (!incident) {
      req.flash("error", "Incident report not found or unauthorized.");
      return res.redirect("/my-incidents");
    }

    res.render("tourism/incidentDetails.ejs", {
      incident,
      isAdminView: false
    });
  } catch (err) {
    console.error("VIEW USER INCIDENT ERROR:", err);
    req.flash("error", "Unable to load incident report.");
    res.redirect("/my-incidents");
  }
});

// 6. Admin Incidents Management Dashboard
app.get("/admin/incidents", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const statusFilter = req.query.status || "all";
    const typeFilter = req.query.type || "all";

    const query = {};
    if (statusFilter !== "all") {
      query.status = statusFilter;
    }
    if (typeFilter !== "all") {
      query.incidentType = typeFilter;
    }

    const incidents = await Incident.find(query)
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .lean();

    const total = await Incident.countDocuments();
    const pending = await Incident.countDocuments({ status: "Pending" });
    const inProgress = await Incident.countDocuments({ status: "In Progress" });
    const resolved = await Incident.countDocuments({ status: "Resolved" });
    const rejected = await Incident.countDocuments({ status: "Rejected" });

    res.render("admin/incidents.ejs", {
      incidents,
      stats: { total, pending, inProgress, resolved, rejected },
      currentStatusFilter: statusFilter,
      currentTypeFilter: typeFilter
    });
  } catch (err) {
    console.error("ADMIN INCIDENTS ERROR:", err);
    req.flash("error", "Unable to load incidents dashboard.");
    res.redirect("/dashboard");
  }
});

// 7. Admin View Specific Incident Report Details
app.get("/admin/incidents/:id", isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid report ID.");
      return res.redirect("/admin/incidents");
    }

    const incident = await Incident.findById(req.params.id)
      .populate("user", "username email")
      .lean();

    if (!incident) {
      req.flash("error", "Incident report not found.");
      return res.redirect("/admin/incidents");
    }

    res.render("tourism/incidentDetails.ejs", {
      incident,
      isAdminView: true
    });
  } catch (err) {
    console.error("ADMIN VIEW INCIDENT ERROR:", err);
    req.flash("error", "Unable to load incident details.");
    res.redirect("/admin/incidents");
  }
});

// 8. Admin Update Incident Status & Internal Notes
app.patch("/admin/incidents/:id/status", isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Invalid report ID." });
      }
      req.flash("error", "Invalid report ID.");
      return res.redirect("/admin/incidents");
    }

    const { status, adminNotes } = req.body;
    const allowedStatuses = ["Pending", "In Progress", "Resolved", "Rejected"];

    if (!allowedStatuses.includes(status)) {
      if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
        return res.status(400).json({ success: false, error: "Invalid status value." });
      }
      req.flash("error", "Invalid status value.");
      return res.redirect(`/admin/incidents/${req.params.id}`);
    }

    const updateData = { status };
    if (typeof adminNotes === "string") {
      updateData.adminNotes = adminNotes.trim();
    }

    const updatedIncident = await Incident.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedIncident) {
      req.flash("error", "Incident report not found.");
      return res.redirect("/admin/incidents");
    }

    console.log(`INCIDENT [${updatedIncident.reportId}] status updated to ${status} by admin ${req.user._id}`);

    if (req.xhr || req.headers.accept?.includes("application/json") || req.is("json")) {
      return res.json({ success: true, incident: updatedIncident });
    }

    req.flash("success", `Incident status updated to "${status}".`);
    return res.redirect(`/admin/incidents/${req.params.id}`);
  } catch (err) {
    console.error("UPDATE INCIDENT STATUS ERROR:", err);
    req.flash("error", "Failed to update incident status.");
    return res.redirect("/admin/incidents");
  }
});

// ==========================================
// ADMIN SAFETY ZONE MANAGEMENT ROUTES (FEATURE 2)
// ==========================================

// 1. List Safety Zones (with status & type filters)
app.get("/admin/safety-zones", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const { status, zoneType } = req.query;
    const filter = {};
    if (status && status !== "all") {
      filter.verificationStatus = status;
    }
    if (zoneType && zoneType !== "all") {
      filter.zoneType = zoneType;
    }

    const zones = await SafetyZone.find(filter)
      .populate("createdBy", "username email")
      .populate("verifiedBy", "username email")
      .sort({ createdAt: -1 });

    const total = await SafetyZone.countDocuments();
    const pending = await SafetyZone.countDocuments({ verificationStatus: "pending" });
    const verified = await SafetyZone.countDocuments({ verificationStatus: "verified" });
    const restricted = await SafetyZone.countDocuments({ zoneType: "restricted_area" });

    res.render("admin/safetyZones.ejs", {
      zones,
      stats: { total, pending, verified, restricted },
      currentStatus: status || "all",
      currentType: zoneType || "all"
    });
  } catch (err) {
    console.error("ADMIN SAFETY ZONES ERROR:", err);
    req.flash("error", "Unable to load safety zones.");
    res.redirect("/dashboard");
  }
});

// 2. Add Safety Zone Form
app.get("/admin/safety-zones/new", isLoggedIn, isAdmin, (req, res) => {
  res.render("admin/safetyZoneForm.ejs", {
    zone: null,
    action: "/admin/safety-zones",
    isEdit: false
  });
});

// 3. Create Safety Zone (Defaults strictly to pending)
app.post("/admin/safety-zones", isLoggedIn, isAdmin, async (req, res) => {
  try {
    const {
      name,
      district,
      latitude,
      longitude,
      radius,
      zoneType,
      restrictedReason,
      sourceName,
      sourceUrl,
      notificationNumber,
      validFrom,
      validUntil
    } = req.body;

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const radNum = parseFloat(radius);

    if (!name || name.trim().length < 2) {
      req.flash("error", "Zone name must be at least 2 characters long.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (!district || district.trim().length === 0) {
      req.flash("error", "District is required.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      req.flash("error", "Latitude must be a valid number between -90 and 90.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      req.flash("error", "Longitude must be a valid number between -180 and 180.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (isNaN(radNum) || radNum <= 0) {
      req.flash("error", "Radius must be a positive number.");
      return res.redirect("/admin/safety-zones/new");
    }

    const validZoneTypes = ["restricted_area", "caution_zone", "safe_zone"];
    if (!zoneType || !validZoneTypes.includes(zoneType)) {
      req.flash("error", "Invalid zone type selected.");
      return res.redirect("/admin/safety-zones/new");
    }

    if ((zoneType === "restricted_area" || zoneType === "caution_zone") && (!restrictedReason || restrictedReason.trim().length === 0)) {
      req.flash("error", "Restricted reason is mandatory for restricted areas and caution zones.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (!sourceName || sourceName.trim().length === 0) {
      req.flash("error", "Official source authority name is required.");
      return res.redirect("/admin/safety-zones/new");
    }

    if (!sourceUrl || (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://"))) {
      req.flash("error", "Source URL must be a valid HTTP or HTTPS URL.");
      return res.redirect("/admin/safety-zones/new");
    }

    let parsedValidFrom = validFrom ? new Date(validFrom) : null;
    let parsedValidUntil = validUntil ? new Date(validUntil) : null;
    if (parsedValidFrom && isNaN(parsedValidFrom.getTime())) parsedValidFrom = null;
    if (parsedValidUntil && isNaN(parsedValidUntil.getTime())) parsedValidUntil = null;

    if (parsedValidFrom && parsedValidUntil && parsedValidUntil < parsedValidFrom) {
      req.flash("error", "Valid Until date cannot be earlier than Valid From date.");
      return res.redirect("/admin/safety-zones/new");
    }

    // New zones must default to pending and must not trigger public safety alerts before verification
    const newZone = new SafetyZone({
      name: name.trim(),
      district: district.trim(),
      latitude: latNum,
      longitude: lngNum,
      radius: radNum,
      zoneType,
      restrictedReason: restrictedReason ? restrictedReason.trim() : "",
      sourceName: sourceName.trim(),
      sourceUrl: sourceUrl.trim(),
      notificationNumber: notificationNumber ? notificationNumber.trim() : "",
      verificationStatus: "pending",
      isActive: true,
      validFrom: parsedValidFrom,
      validUntil: parsedValidUntil,
      createdBy: req.user._id,
      verifiedBy: null,
      verifiedAt: null,
      geometry: {
        type: "Point",
        coordinates: [lngNum, latNum]
      }
    });

    await newZone.save();
    req.flash("success", `Safety zone "${newZone.name}" created. Verification status set to Pending.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("CREATE SAFETY ZONE ERROR:", err);
    req.flash("error", "Failed to create safety zone. Please check your inputs.");
    res.redirect("/admin/safety-zones/new");
  }
});

// 4. Edit Safety Zone Form
app.get("/admin/safety-zones/:id/edit", isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    res.render("admin/safetyZoneForm.ejs", {
      zone,
      action: `/admin/safety-zones/${zone._id}`,
      isEdit: true
    });
  } catch (err) {
    console.error("EDIT SAFETY ZONE GET ERROR:", err);
    req.flash("error", "Error loading safety zone.");
    res.redirect("/admin/safety-zones");
  }
});

// 5. Update Safety Zone Details
app.post("/admin/safety-zones/:id", isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    const {
      name,
      district,
      latitude,
      longitude,
      radius,
      zoneType,
      restrictedReason,
      sourceName,
      sourceUrl,
      notificationNumber,
      validFrom,
      validUntil
    } = req.body;

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const radNum = parseFloat(radius);

    if (!name || name.trim().length < 2) {
      req.flash("error", "Zone name must be at least 2 characters long.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (!district || district.trim().length === 0) {
      req.flash("error", "District is required.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      req.flash("error", "Latitude must be a valid number between -90 and 90.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      req.flash("error", "Longitude must be a valid number between -180 and 180.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (isNaN(radNum) || radNum <= 0) {
      req.flash("error", "Radius must be a positive number.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    const validZoneTypes = ["restricted_area", "caution_zone", "safe_zone"];
    if (!zoneType || !validZoneTypes.includes(zoneType)) {
      req.flash("error", "Invalid zone type selected.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if ((zoneType === "restricted_area" || zoneType === "caution_zone") && (!restrictedReason || restrictedReason.trim().length === 0)) {
      req.flash("error", "Restricted reason is mandatory for restricted areas and caution zones.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (!sourceName || sourceName.trim().length === 0) {
      req.flash("error", "Official source authority name is required.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    if (!sourceUrl || (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://"))) {
      req.flash("error", "Source URL must be a valid HTTP or HTTPS URL.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    let parsedValidFrom = validFrom ? new Date(validFrom) : null;
    let parsedValidUntil = validUntil ? new Date(validUntil) : null;
    if (parsedValidFrom && isNaN(parsedValidFrom.getTime())) parsedValidFrom = null;
    if (parsedValidUntil && isNaN(parsedValidUntil.getTime())) parsedValidUntil = null;

    if (parsedValidFrom && parsedValidUntil && parsedValidUntil < parsedValidFrom) {
      req.flash("error", "Valid Until date cannot be earlier than Valid From date.");
      return res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
    }

    zone.name = name.trim();
    zone.district = district.trim();
    zone.latitude = latNum;
    zone.longitude = lngNum;
    zone.radius = radNum;
    zone.zoneType = zoneType;
    zone.restrictedReason = restrictedReason ? restrictedReason.trim() : "";
    zone.sourceName = sourceName.trim();
    zone.sourceUrl = sourceUrl.trim();
    zone.notificationNumber = notificationNumber ? notificationNumber.trim() : "";
    zone.validFrom = parsedValidFrom;
    zone.validUntil = parsedValidUntil;
    zone.geometry = {
      type: "Point",
      coordinates: [lngNum, latNum]
    };

    await zone.save();
    req.flash("success", `Safety zone "${zone.name}" updated successfully.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("EDIT SAFETY ZONE POST ERROR:", err);
    req.flash("error", "Failed to update safety zone.");
    res.redirect(`/admin/safety-zones/${req.params.id}/edit`);
  }
});

// Put alias for edit
app.put("/admin/safety-zones/:id", isLoggedIn, isAdmin, async (req, res) => {
  // forward to post handler
  req.url = `/admin/safety-zones/${req.params.id}`;
  return app._router.handle(req, res);
});

// 6. Verify or Reject Safety Zone
app.post("/admin/safety-zones/:id/verify", isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const { decision } = req.body;
    if (!["verified", "rejected"].includes(decision)) {
      req.flash("error", "Invalid verification decision.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    if (decision === "verified") {
      if (!zone.sourceName || !zone.sourceUrl) {
        req.flash("error", "Cannot verify zone without official source name and URL.");
        return res.redirect("/admin/safety-zones");
      }
      zone.verificationStatus = "verified";
      zone.verifiedBy = req.user._id;
      zone.verifiedAt = new Date();
    } else {
      zone.verificationStatus = "rejected";
      zone.verifiedBy = req.user._id;
      zone.verifiedAt = new Date();
    }

    await zone.save();
    req.flash("success", `Safety zone "${zone.name}" marked as ${decision}.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("VERIFY SAFETY ZONE ERROR:", err);
    req.flash("error", "Failed to update verification status.");
    res.redirect("/admin/safety-zones");
  }
});

// 7. Toggle Active/Inactive
app.post("/admin/safety-zones/:id/toggle-active", isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findById(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    zone.isActive = !zone.isActive;
    await zone.save();

    req.flash("success", `Zone "${zone.name}" is now ${zone.isActive ? "active" : "deactivated"}.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("TOGGLE ACTIVE ERROR:", err);
    req.flash("error", "Failed to toggle zone active state.");
    res.redirect("/admin/safety-zones");
  }
});

// 8. Delete Safety Zone
app.post("/admin/safety-zones/:id/delete", isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash("error", "Invalid zone ID.");
      return res.redirect("/admin/safety-zones");
    }

    const zone = await SafetyZone.findByIdAndDelete(req.params.id);
    if (!zone) {
      req.flash("error", "Safety zone not found.");
      return res.redirect("/admin/safety-zones");
    }

    req.flash("success", `Safety zone "${zone.name}" has been deleted.`);
    res.redirect("/admin/safety-zones");
  } catch (err) {
    console.error("DELETE SAFETY ZONE ERROR:", err);
    req.flash("error", "Failed to delete safety zone.");
    res.redirect("/admin/safety-zones");
  }
});

app.delete("/admin/safety-zones/:id", isLoggedIn, isAdmin, async (req, res) => {
  req.url = `/admin/safety-zones/${req.params.id}/delete`;
  return app._router.handle(req, res);
});

// ==========================================
// SMART TRIP COMPANION ROUTES
// ==========================================

// Trip Companion Page - Start Trip
app.get('/my-trips/:id/start', isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash('error', 'Invalid trip ID.');
      return res.redirect('/my-trips');
    }
    const trip = await SavedTrip.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!trip) {
      req.flash('error', 'Trip not found or unauthorized.');
      return res.redirect('/my-trips');
    }
    if (!trip.days || trip.days.length === 0) {
      req.flash('error', 'This trip has no itinerary days. Please edit it first.');
      return res.redirect('/my-trips');
    }

    // Collect placeIds and names from activities across all days
    const placeIds = [];
    const placeNames = [];
    for (const day of trip.days) {
      for (const act of (day.activities || [])) {
        if (act.placeId && mongoose.Types.ObjectId.isValid(String(act.placeId))) {
          placeIds.push(String(act.placeId));
        }
        if (act.place && typeof act.place === 'string') {
          placeNames.push(act.place.trim());
        }
      }
    }
    const placeIdSet = [...new Set(placeIds)];
    const uniquePlaceNames = [...new Set(placeNames)];

    let destinationMap = {};
    const queryConditions = [];
    if (placeIdSet.length > 0) queryConditions.push({ _id: { $in: placeIdSet } });
    if (uniquePlaceNames.length > 0) queryConditions.push({ name: { $in: uniquePlaceNames } });

    if (queryConditions.length > 0) {
      const places = await touristplace
        .find({ $or: queryConditions })
        .select('_id name location geoFence district category images')
        .lean();
      for (const p of places) {
        const placeData = {
          id: p._id.toString(),
          name: p.name,
          district: p.district || '',
          category: p.category || '',
          latitude: p.location?.latitude ?? null,
          longitude: p.location?.longitude ?? null,
          address: p.location?.address || '',
          image: (p.images && p.images.length > 0) ? p.images[0] : null,
          geoFenceEnabled: p.geoFence?.enabled || false,
          geoFenceRadius: p.geoFence?.radius || 300
        };
        destinationMap[p._id.toString()] = placeData;
        if (p.name) {
          destinationMap[p.name.toLowerCase().trim()] = placeData;
        }
      }
    }

    // Mark trip as in_progress if not already started (safe, only if not_started)
    if (!trip.tripStatus || trip.tripStatus === 'not_started') {
      await SavedTrip.updateOne(
        { _id: trip._id, user: req.user._id },
        { $set: { tripStatus: 'in_progress', 'tripProgress.startedAt': new Date(), 'tripProgress.lastSavedAt': new Date() } }
      );
      trip.tripStatus = 'in_progress';
    }

    res.render('tourism/tripcompanion.ejs', {
      trip,
      destinationMap,
      destinationMapJSON: JSON.stringify(destinationMap)
    });
  } catch (err) {
    console.error('START TRIP ERROR:', err);
    req.flash('error', 'Unable to load trip companion.');
    return res.redirect('/my-trips');
  }
});

// Save Trip Progress (AJAX)
app.post('/my-trips/:id/progress', isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid trip ID.' });
    }
    const trip = await SavedTrip.findOne({ _id: req.params.id, user: req.user._id });
    if (!trip) return res.status(404).json({ success: false, error: 'Trip not found.' });

    const { currentDayIndex, currentActivityIndex, completedActivityId, tripStatus } = req.body;
    const setData = { 'tripProgress.lastSavedAt': new Date() };
    const addToSet = {};

    if (currentDayIndex !== undefined) {
      const d = parseInt(currentDayIndex, 10);
      if (!isNaN(d) && d >= 0 && d < trip.days.length) setData['tripProgress.currentDayIndex'] = d;
    }
    if (currentActivityIndex !== undefined) {
      const a = parseInt(currentActivityIndex, 10);
      if (!isNaN(a) && a >= 0) setData['tripProgress.currentActivityIndex'] = a;
    }
    if (completedActivityId && mongoose.Types.ObjectId.isValid(completedActivityId)) {
      addToSet['tripProgress.completedActivityIds'] = completedActivityId;
    }
    if (tripStatus && ['in_progress', 'paused'].includes(tripStatus)) {
      setData.tripStatus = tripStatus;
    }

    const mongoUpdate = { $set: setData };
    if (Object.keys(addToSet).length > 0) mongoUpdate.$addToSet = addToSet;
    await SavedTrip.updateOne({ _id: trip._id, user: req.user._id }, mongoUpdate);

    return res.json({ success: true });
  } catch (err) {
    console.error('SAVE PROGRESS ERROR:', err);
    return res.status(500).json({ success: false, error: 'Failed to save progress.' });
  }
});

// Complete Trip
app.post('/my-trips/:id/complete', isLoggedIn, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(400).json({ success: false, error: 'Invalid trip ID.' });
      req.flash('error', 'Invalid trip ID.');
      return res.redirect('/my-trips');
    }
    const trip = await SavedTrip.findOne({ _id: req.params.id, user: req.user._id });
    if (!trip) {
      if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(404).json({ success: false, error: 'Trip not found.' });
      req.flash('error', 'Trip not found.');
      return res.redirect('/my-trips');
    }
    await SavedTrip.updateOne(
      { _id: trip._id, user: req.user._id },
      { $set: { tripStatus: 'completed', 'tripProgress.completedAt': new Date(), 'tripProgress.lastSavedAt': new Date() } }
    );
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'Trip completed!' });
    }
    req.flash('success', 'Congratulations! Your trip is complete! 🎉');
    return res.redirect('/my-trips');
  } catch (err) {
    console.error('COMPLETE TRIP ERROR:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) return res.status(500).json({ success: false, error: 'Failed to complete trip.' });
    req.flash('error', 'Failed to complete trip.');
    return res.redirect('/my-trips');
  }
});

// Weather API using Open-Meteo (free, no API key required)
app.get('/api/trips/weather', isLoggedIn, async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates. Provide valid lat and lon query params.' });
    }
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,precipitation_probability_max&timezone=Asia%2FKolkata&forecast_days=7`;
    const response = await axios.get(weatherUrl, { timeout: 8000 });
    const data = response.data;

    function describeCode(c) {
      const m = { 0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Icy fog',51:'Light drizzle',53:'Moderate drizzle',55:'Dense drizzle',61:'Slight rain',63:'Moderate rain',65:'Heavy rain',71:'Slight snow',73:'Moderate snow',75:'Heavy snow',77:'Snow grains',80:'Slight showers',81:'Moderate showers',82:'Violent showers',85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail' };
      return m[c] || `Weather code ${c}`;
    }
    function iconFor(c) {
      if (c <= 1) return '☀️';
      if (c === 2) return '⛅';
      if (c === 3) return '☁️';
      if (c <= 48) return '🌫️';
      if (c <= 55) return '🌦️';
      if (c <= 65) return '🌧️';
      if (c <= 77) return '❄️';
      if (c <= 82) return '🌩️';
      return '⛈️';
    }

    const cur = data.current ? {
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      precipitation: data.current.precipitation,
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
      weatherCode: data.current.weather_code,
      description: describeCode(data.current.weather_code),
      icon: iconFor(data.current.weather_code),
      time: data.current.time
    } : null;

    const daily = [];
    if (data.daily && data.daily.time) {
      for (let i = 0; i < data.daily.time.length; i++) {
        daily.push({
          date: data.daily.time[i],
          maxTemp: data.daily.temperature_2m_max[i],
          minTemp: data.daily.temperature_2m_min[i],
          precipitation: data.daily.precipitation_sum[i],
          precipitationProb: data.daily.precipitation_probability_max[i],
          weatherCode: data.daily.weather_code[i],
          description: describeCode(data.daily.weather_code[i]),
          icon: iconFor(data.daily.weather_code[i])
        });
      }
    }

    const warnings = [];
    if (cur) {
      if ([95, 96, 99].includes(cur.weatherCode)) warnings.push({ level: 'danger', text: 'Thunderstorm conditions detected. Exercise caution and seek shelter if outdoors.' });
      else if (cur.weatherCode >= 80 && cur.weatherCode <= 82) warnings.push({ level: 'warning', text: 'Heavy rain showers. Check local conditions before visiting outdoor sites.' });
      else if ([61, 63, 65].includes(cur.weatherCode)) warnings.push({ level: 'warning', text: 'Rainfall in progress. Outdoor visibility may be reduced.' });
      if (cur.temperature > 42) warnings.push({ level: 'warning', text: `Extreme heat: ${cur.temperature}°C. Stay hydrated and avoid strenuous outdoor activity during peak hours.` });
      if (cur.windSpeed > 50) warnings.push({ level: 'warning', text: `High winds: ${cur.windSpeed} km/h. Check local advisories before trekking or visiting coastal areas.` });
    }

    return res.json({ success: true, current: cur, daily, warnings, timezone: data.timezone, units: { temperature: '°C', windSpeed: 'km/h', precipitation: 'mm' } });
  } catch (err) {
    console.error('WEATHER API ERROR:', err.message);
    if (err.code === 'ECONNABORTED') return res.status(504).json({ success: false, error: 'Weather service timed out. Please try again.' });
    return res.status(503).json({ success: false, error: 'Weather data temporarily unavailable.' });
  }
});

// Geofence API — also support POST-based admin status patch (method-override alias)
app.post('/admin/incidents/:id/status', isLoggedIn, isAdmin, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash('error', 'Invalid report ID.');
      return res.redirect('/admin/incidents');
    }
    const { status, adminNotes } = req.body;
    const allowedStatuses = ['Pending', 'In Progress', 'Resolved', 'Rejected'];
    if (!allowedStatuses.includes(status)) {
      req.flash('error', 'Invalid status value.');
      return res.redirect(`/admin/incidents/${req.params.id}`);
    }
    const updateData = { status };
    if (typeof adminNotes === 'string') updateData.adminNotes = adminNotes.trim();
    const updated = await Incident.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updated) {
      req.flash('error', 'Incident report not found.');
      return res.redirect('/admin/incidents');
    }
    req.flash('success', `Incident status updated to "${status}".`);
    return res.redirect(`/admin/incidents/${req.params.id}`);
  } catch (err) {
    console.error('UPDATE INCIDENT STATUS ERROR:', err);
    req.flash('error', 'Failed to update incident status.');
    return res.redirect('/admin/incidents');
  }
});



app.listen(8080,()=>{
    console.log("app is listining on post",8080);
})
