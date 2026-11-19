// Pin timezone so date math is deterministic in any environment (CI = UTC).
process.env.TZ = "UTC";
