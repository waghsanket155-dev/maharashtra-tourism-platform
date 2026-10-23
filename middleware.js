module.exports.isredirect=(req,res,next)=>{
  if(req.session.redirectUrl){
     res.locals.redirectUrl=req.session.redirectUrl;
  }
  next();
}

module.exports.isAdmin=(req, res, next) =>{
    if (req.isAuthenticated() && req.user.role === "admin") {
        return next();
    }

    res.redirect("/login");
}

module.exports.isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    if (req.session) {
        req.session.redirectUrl = req.originalUrl;
    }
    res.redirect("/login");
};
