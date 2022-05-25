import BN from "bn.js";
import { PythBalance } from "../app";
import assert from "assert";

describe("pyth balance tests", async () => {
  it("Tests on 0", async () => {
    let amount = PythBalance.fromString("0");
    assert.equal(amount.toNumber(), 0);
    assert.equal(amount.toString(), "0");
    assert(amount.eq(new PythBalance(new BN(0))));
    assert(amount.toBN().eq(new BN(0)));

    amount = new PythBalance(new BN(0));
    assert.equal(amount.toNumber(), 0);
    assert.equal(amount.toString(), "0");
    assert(amount.eq(new PythBalance(new BN(0))));
    assert(amount.toBN().eq(new BN(0)));

    amount = PythBalance.fromNumber(0);
    assert.equal(amount.toNumber(), 0);
    assert.equal(amount.toString(), "0");
    assert(amount.eq(new PythBalance(new BN(0))));
    assert(amount.toBN().eq(new BN(0)));

    amount = PythBalance.fromString(".");
    assert.equal(amount.toString(), "0");
    assert(amount.eq(new PythBalance(new BN(0))));
  });

  it("Tests on 0.1", async () => {
    let amount = PythBalance.fromString("0.10000");
    assert.equal(amount.toString(), "0.1");
    assert(amount.eq(new PythBalance(new BN(100_000))));
    assert(amount.toBN().eq(new BN(100_000)));

    amount = PythBalance.fromString("0.1");
    assert.equal(amount.toString(), "0.1");
    assert(amount.eq(new PythBalance(new BN(100_000))));
    assert(amount.toBN().eq(new BN(100_000)));

    amount = PythBalance.fromString(".1");
    assert.equal(amount.toString(), "0.1");
    assert(amount.eq(new PythBalance(new BN(100_000))));
    assert(amount.toBN().eq(new BN(100_000)));

    amount = new PythBalance(new BN(100_000));
    assert.equal(amount.toString(), "0.1");
    assert(amount.eq(new PythBalance(new BN(100_000))));
    assert(amount.toBN().eq(new BN(100_000)));
  });

  it("Tests on 100", async () => {
    let amount = PythBalance.fromString("100.0");
    assert.equal(amount.toString(), "100");
    assert.equal(amount.toNumber(), 100);
    assert(amount.eq(new PythBalance(new BN(100_000_000))));
    assert(amount.toBN().eq(new BN(100_000_000)));

    amount = PythBalance.fromString("100");
    assert.equal(amount.toString(), "100");
    assert.equal(amount.toNumber(), 100);
    assert(amount.eq(new PythBalance(new BN(100_000_000))));
    assert(amount.toBN().eq(new BN(100_000_000)));

    amount = new PythBalance(new BN(100_000_000));
    assert.equal(amount.toString(), "100");
    assert.equal(amount.toNumber(), 100);
    assert(amount.eq(new PythBalance(new BN(100_000_000))));
    assert(amount.toBN().eq(new BN(100_000_000)));

    amount = PythBalance.fromNumber(100);
    assert.equal(amount.toString(), "100");
    assert.equal(amount.toNumber(), 100);
    assert(amount.eq(new PythBalance(new BN(100_000_000))));
    assert(amount.toBN().eq(new BN(100_000_000)));

    amount = PythBalance.fromString("100.");
    assert.equal(amount.toString(), "100");
    assert.equal(amount.toNumber(), 100);
    assert(amount.eq(new PythBalance(new BN(100_000_000))));
    assert(amount.toBN().eq(new BN(100_000_000)));
  });

  it("Tests on 60969.430243", async () => {
    let amount = PythBalance.fromString("60969.430243");
    assert.equal(amount.toString(), "60969.430243");
    assert(amount.eq(new PythBalance(new BN(60_969_430_243))));

    amount = PythBalance.fromString("060969.430243");
    assert.equal(amount.toString(), "60969.430243");
    assert(amount.eq(new PythBalance(new BN(60_969_430_243))));

    amount = new PythBalance(new BN(60_969_430_243));
    assert.equal(amount.toString(), "60969.430243");
    assert(amount.eq(new PythBalance(new BN(60_969_430_243))));
    assert(amount.toBN().eq(new BN(60_969_430_243)));
  });

  it("Tests comparison", async () => {
    let small = PythBalance.fromString("101");
    let big = PythBalance.fromString("102");

    assert(small.eq(small));
    assert(small.lt(big));
    assert(small.lte(big));
    assert(big.gt(small));
    assert(big.gte(small));
  });

  it("Raises an error", async () => {
    for (let s of ["", "a", "a.2", "0xpyth", "1.0000001"]) {
      try {
        PythBalance.fromString(s);
        assert(false, "Operation should fail");
      } catch (err) {
        assert.equal(err.message, "Failed parsing");
      }
    }
  });
});
