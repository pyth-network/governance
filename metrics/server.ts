import { Metrics } from "./governance_metrics";
import express from "express";
import { register } from "prom-client";

const metrics = new Metrics();

async function main() {
  while (true) {
    await metrics.updateAllMetrics();
    console.log(await register.metrics());
  }
}
const server = express();
server.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

const port = process.env.PORT || 3000;
server.listen(port);

main();
