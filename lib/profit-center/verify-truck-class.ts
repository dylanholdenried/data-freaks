/**
 * Offline verification for inferTruckClass.
 * Run: npx tsx lib/profit-center/verify-truck-class.ts
 */
import { inferTruckClass } from "./truckClass";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(inferTruckClass("Chevrolet", "Silverado 1500") === "1500", "Silverado 1500");
assert(inferTruckClass("GMC", "Sierra 2500 HD") === "2500", "Sierra 2500 HD");
assert(inferTruckClass("Ram", "3500") === "3500", "Ram 3500");
assert(inferTruckClass("Ford", "F-150") === "1500", "F-150");
assert(inferTruckClass("Ford", "F150") === "1500", "F150");
assert(inferTruckClass("Ford", "F250") === "2500", "F250");
assert(inferTruckClass("Ford", "F-350") === "3500", "F-350");
assert(inferTruckClass("Ford", "F-450") === "4500+", "F-450");
assert(inferTruckClass("Chevrolet", "Silverado 4500") === "4500+", "Silverado 4500");
assert(inferTruckClass("Toyota", "Camry") === "(No class)", "Camry");
assert(inferTruckClass("Toyota", "Tacoma") === "(No class)", "Tacoma midsize");
assert(inferTruckClass("", "") === "(No class)", "empty");

console.log("verify-truck-class: ok");
