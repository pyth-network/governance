const fs = require("fs");
const path = require("path");

// Get latest JSON file in snapshots directory
const snapshotsDir = path.join(__dirname, "../snapshots");
const files = fs
  .readdirSync(snapshotsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    file: f,
    mtime: fs.statSync(path.join(snapshotsDir, f)).mtime,
  }))
  .sort((a, b) => b.mtime - a.mtime);

if (files.length === 0) throw new Error("No JSON files found");

const latestFile = path.join(snapshotsDir, files[0].file);

const data = JSON.parse(fs.readFileSync(latestFile));

const ois_staking_records = data
  .filter((entry) => entry.staked_in_ois > 0)
  .map((entry) => ({
    address: entry.owner,
    amount: parseFloat((entry.staked_in_ois / 1000_000).toFixed(2)),
  }));

console.log("ois_staking_records", ois_staking_records);

// fetch(process.env.STAKING_DATA_API_URL, {
//   method: "POST",
//   headers: {
//     "Content-Type": "application/json",
//     Authorization: `Bearer ${process.env.STAKING_DATA_API_KEY}`,
//   },
//   body: JSON.stringify(ois_staking_records),
// })
//   .then((res) => res.json())
//   .then((data) => {
//     console.log(data);
//   })
//   .catch((err) => {
//     console.error(err);
//   });
