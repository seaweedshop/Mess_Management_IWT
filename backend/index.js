import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const { Schema, model, models } = mongoose,
  ref = { type: Schema.Types.ObjectId, ref: "User" },
  T = { timestamps: true };
const User =
  models.User ||
  model(
    "User",
    new Schema(
      {
        name: String,
        email: { type: String, unique: true, lowercase: true },
        hash: String,
        role: { type: String, default: "student" },
        room: String,
      },
      T,
    ),
  );
const Meal =
  models.Meal ||
  model(
    "Meal",
    new Schema({
      day: Number,
      type: String,
      items: [String],
      veg: { type: Boolean, default: true },
      calories: Number,
      protein: Number,
      price: { type: Number, default: 80 },
      allergens: [String],
    }),
  );
const Fee =
  models.Fee ||
  model(
    "Fee",
    new Schema(
      {
        user: ref,
        month: String,
        amount: Number,
        status: { type: String, default: "pending" },
        paidOn: Date,
      },
      T,
    ),
  );
const Coupon =
  models.Coupon ||
  model(
    "Coupon",
    new Schema(
      {
        user: ref,
        meal: ref,
        day: Number,
        type: String,
        item: String,
        price: { type: Number, default: 80 },
        status: { type: String, default: "pending" },
        paidOn: Date,
      },
      T,
    ),
  );
const Fb =
  models.Fb ||
  model(
    "Fb",
    new Schema(
      {
        user: ref,
        kind: String,
        text: String,
        rating: Number,
        meal: String,
        anon: Boolean,
        status: { type: String, default: "open" },
        reply: String,
      },
      T,
    ),
  );
const Ann = models.Ann || model("Ann", new Schema({ text: String }, T));
const defaultOdiaMenu = [
  [["Pakhala bhata", "Aloo bhaja", "Dalma"], ["Rice", "Dalma", "Badi chura"], ["Chuda santula"], ["Rice", "Machha besara", "Saga bhaja"]],
  [["Suji halwa", "Ghuguni"], ["Rice", "Dal", "Aloo posto"], ["Muri mixture"], ["Rice", "Chicken kasa", "Dalma"]],
  [["Bara ghuguni"], ["Rice", "Dal", "Santula"], ["Dahi chuda"], ["Rice", "Paneer tarkari", "Dal"]],
  [["Manda pitha", "Banana"], ["Rice", "Dalma", "Bhaja"], ["Chakuli pitha"], ["Rice", "Machha curry", "Kankada bhaja"]],
  [["Upma", "Ghuguni"], ["Rice", "Dal", "Aloo bhaja"], ["Chuda ghasa"], ["Rice", "Chicken jhol", "Saga bhaja"]],
  [["Dahi chuda", "Banana"], ["Rice", "Dalma", "Badi chura"], ["Muri santula"], ["Rice", "Machha tarkari", "Dal"]],
  [["Puri", "Aloo dum"], ["Rice", "Dal", "Mix veg"], ["Rasabali"], ["Rice", "Paneer curry", "Dalma"]],
].flatMap((day, index) =>
  day.map((items, mealIndex) => ({
    day: index,
    type: ["breakfast", "lunch", "snacks", "dinner"][mealIndex],
    items,
    veg: !(items.some((item) => /machha|chicken|kankada/i.test(item))),
    calories: [420, 680, 220, 720][mealIndex],
    protein: [10, 22, 6, 25][mealIndex],
    price: [50, 80, 40, 100][mealIndex],
    allergens: items.some((item) => /pitha|puri|upma/i.test(item)) ? ["gluten"] : [],
  })),
);
const app = express();
app.use(express.json());
let dbConnection;
const connectDb = () => {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }
  dbConnection ??= mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
  });
  return dbConnection;
};
app.use(async (q, s, n) => {
  try {
    await connectDb();
    n();
  } catch (error) {
    n(error);
  }
});
const auth = (role) => async (q, s, n) => {
  try {
    const { id } = jwt.verify(
      (q.headers.authorization || "").slice(7),
      process.env.JWT_SECRET,
    );
    q.u = await User.findById(id);
    if (!q.u || (role && q.u.role !== role)) throw 0;
    n();
  } catch {
    s.status(401).json({ error: "Unauthorized" });
  }
};
const A = auth("admin"),
  S = auth(),
  sign = (u) => ({
    token: jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: "30d" }),
    user: { id: u.id, name: u.name, email: u.email, role: u.role },
  });
app.post("/api/auth/register", async (q, s) => {
  const { name, email = "", password = "", room } = q.body,
    e = email.trim().toLowerCase();
  if (!e.endsWith("@iiit-bh.ac.in"))
    return s.status(400).json({ error: "Use your @iiit-bh.ac.in email" });
  if (password.length < 6 || !name)
    return s.status(400).json({ error: "Name and 6+ char password required" });
  if (await User.findOne({ email: e }))
    return s.status(400).json({ error: "Already registered" });
  const admin = (process.env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim())
    .includes(e);
  s.json(
    sign(
      await User.create({
        name,
        room,
        email: e,
        hash: await bcrypt.hash(password, 10),
        role: admin ? "admin" : "student",
      }),
    ),
  );
});
app.post("/api/auth/login", async (q, s) => {
  const u = await User.findOne({
    email: (q.body.email || "").trim().toLowerCase(),
  });
  if (!u || !(await bcrypt.compare(q.body.password || "", u.hash)))
    return s.status(400).json({ error: "Invalid credentials" });
  s.json(sign(u));
});
app.get("/api/me", S, (q, s) => s.json(sign(q.u).user));
app.get("/api/menu", S, async (q, s) => {
  let menu = await Meal.find().sort({ day: 1, type: 1 });
  if (!menu.length) {
    await Meal.insertMany(defaultOdiaMenu);
    menu = await Meal.find().sort({ day: 1, type: 1 });
  }
  s.json(menu);
});
app.post("/api/menu/seed", A, async (q, s) => {
  await Meal.deleteMany({});
  const menu = await Meal.insertMany(defaultOdiaMenu);
  s.json(menu);
});
app.post("/api/menu", A, async (q, s) =>
  s.json(
    await Meal.findOneAndUpdate(
      { day: q.body.day, type: q.body.type },
      q.body,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ),
  ),
);
app.delete("/api/menu/:id", A, async (q, s) =>
  s.json(await Meal.findByIdAndDelete(q.params.id)),
);
app.get("/api/announcements", S, async (q, s) =>
  s.json(await Ann.find().sort({ createdAt: -1 })),
);
app.post("/api/announcements", A, async (q, s) =>
  s.json(await Ann.create({ text: q.body.text })),
);
app.get("/api/fees", S, async (q, s) =>
  s.json(
    await Fee.find(q.u.role === "admin" ? {} : { user: q.u.id })
      .populate("user", "name email room")
      .sort({ createdAt: -1 }),
  ),
);
app.post("/api/fees", A, async (q, s) => {
  const st = await User.find({ role: "student" });
  s.json(
    await Fee.insertMany(
      st.map((u) => ({
        user: u.id,
        month: q.body.month,
        amount: q.body.amount,
      })),
    ),
  );
});
app.patch("/api/fees/:id/paid", A, async (q, s) =>
  s.json(
    await Fee.findByIdAndUpdate(
      q.params.id,
      { status: "paid", paidOn: new Date() },
      { new: true },
    ),
  ),
);
app.patch("/api/fees/:id/pay", S, async (q, s) =>
  s.json(
    await Fee.findOneAndUpdate(
      { _id: q.params.id, user: q.u.id, status: "pending" },
      { status: "paid", paidOn: new Date() },
      { new: true },
    ),
  ),
);
app.get("/api/coupons", S, async (q, s) =>
  s.json(await Coupon.find({ user: q.u.id }).sort({ createdAt: -1 })),
);
app.post("/api/coupons", S, async (q, s) => {
  const { meal, day, type, item, price = 80 } = q.body;
  if (!item || !type || day === undefined)
    return s.status(400).json({ error: "Meal details are required" });
  const existing = await Coupon.findOne({
    user: q.u.id,
    day,
    type,
    item,
  });
  if (existing) return s.json(existing);
  s.json(
    await Coupon.create({
      user: q.u.id,
      meal,
      day,
      type,
      item,
      price,
    }),
  );
});
app.patch("/api/coupons/:id/pay", S, async (q, s) =>
  s.json(
    await Coupon.findOneAndUpdate(
      { _id: q.params.id, user: q.u.id, status: "pending" },
      { status: "paid", paidOn: new Date() },
      { new: true },
    ),
  ),
);
app.post("/api/feedback", S, async (q, s) => {
  const { kind, text, rating, meal, anon } = q.body;
  s.json(await Fb.create({ kind, text, rating, meal, anon, user: q.u.id }));
});
app.get("/api/feedback", S, async (q, s) => {
  const adm = q.u.role === "admin",
    l = await Fb.find(adm ? {} : { user: q.u.id })
      .populate("user", "name")
      .sort({ createdAt: -1 })
      .lean();
  s.json(l.map((f) => (adm && f.anon ? { ...f, user: null } : f)));
});
app.patch("/api/feedback/:id", A, async (q, s) =>
  s.json(
    await Fb.findByIdAndUpdate(
      q.params.id,
      { status: q.body.status, reply: q.body.reply },
      { new: true },
    ),
  ),
);
app.use((e, q, s, n) => {
  if (e?.name === "MongooseServerSelectionError") {
    return s.status(503).json({
      error:
        "MongoDB Atlas is unreachable. Add your current IP to Atlas Network Access and verify MONGODB_URI.",
    });
  }
  s.status(500).json({ error: e.message || "Internal server error" });
});
export default app;
if (!process.env.VERCEL) app.listen(3000, () => console.log("API :3000"));
