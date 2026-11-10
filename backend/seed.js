import fs from "node:fs/promises";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const envFile = await fs.readFile(".env", "utf8").catch(() => "");
for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const { Schema, model, models } = mongoose;
const timestamps = { timestamps: true };
const User = models.User || model("User", new Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  hash: String,
  role: { type: String, default: "student" },
  room: String,
}, timestamps));
const Fee = models.Fee || model("Fee", new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User" },
  month: String,
  amount: Number,
  status: { type: String, default: "pending" },
  paidOn: Date,
}, timestamps));

const databaseUrl = process.env.MONGODB_URI;
if (!databaseUrl) {
  throw new Error("MONGODB_URI is not configured. Add it to the root .env file before running npm run seed.");
}

const passwordFor = (id) => `PlateMate@${id}`;
const students = Array.from({ length: 50 }, (_, index) => {
  const id = `b123${String(index + 1).padStart(3, "0")}`;
  return {
    id,
    email: `${id}@iiit-bh.ac.in`,
    name: `Student ${id}`,
    password: passwordFor(id),
    room: `BH-1-${String(index + 1).padStart(3, "0")}`,
  };
});
const admin = {
  id: "admin",
  email: "admin@iiit-bh.ac.in",
  name: "Mess Administrator",
  password: "PlateMate@Admin123",
};

await mongoose.connect(databaseUrl, { serverSelectionTimeoutMS: 10000 });

const accountRows = [admin, ...students];
const passwordHashes = await Promise.all(accountRows.map((account) => bcrypt.hash(account.password, 10)));
await User.bulkWrite(accountRows.map((account, index) => ({
  updateOne: {
    filter: { email: account.email },
    update: {
      $set: {
        name: account.name,
        hash: passwordHashes[index],
        role: account.id === "admin" ? "admin" : "student",
        room: account.room,
      },
      $setOnInsert: { email: account.email },
    },
    upsert: true,
  },
})));

const users = await User.find({ email: { $in: students.map((student) => student.email) } }).select("_id email").lean();
const userByEmail = new Map(users.map((user) => [user.email, user._id]));
await Fee.deleteMany({ user: { $in: users.map((user) => user._id) } });
const now = new Date();
const months = Array.from({ length: 4 }, (_, index) => {
  const date = new Date(now);
  date.setMonth(date.getMonth() - (3 - index));
  return date.toLocaleString("en-IN", { month: "short", year: "numeric" });
});
const feeRows = students.flatMap((student, studentIndex) =>
  months.map((month, monthIndex) => {
    const paid = (studentIndex + monthIndex) % 3 !== 0;
    const paidOn = new Date(now);
    paidOn.setDate(
      paidOn.getDate() - ((3 - monthIndex) * 14 + (studentIndex % 10)),
    );
    return {
      user: userByEmail.get(student.email),
      month,
      amount: 2400,
      status: paid ? "paid" : "pending",
      ...(paid ? { paidOn } : {}),
    };
  }),
);
await Fee.bulkWrite(feeRows.map((fee) => ({
  updateOne: {
    filter: { user: fee.user, month: fee.month },
    update: { $set: fee },
    upsert: true,
  },
})));

const lines = [
  "PlateMate development seed credentials",
  "These are local development accounts. Change or remove them before production.",
  "",
  "ADMIN",
  `Email: ${admin.email}`,
  `Password: ${admin.password}`,
  "",
  "STUDENTS",
  "ID,Email,Password",
  ...students.map((student) => `${student.id},${student.email},${student.password}`),
  "",
  `Seeded ${students.length} students and ${feeRows.length} offline fee records.`,
];
await fs.writeFile("SEED_CREDENTIALS.txt", `${lines.join("\n")}\n`, "utf8");
console.log(`Seeded ${students.length} students, ${feeRows.length} fee records, and SEED_CREDENTIALS.txt`);
await mongoose.disconnect();
