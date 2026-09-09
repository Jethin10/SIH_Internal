"use strict";

// Use the same browser and privacy pipeline as the tested demo, without its
// synthetic profile, shopping task or fixture server.
require("./browser-use-demo")
  .main({ demo: false })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
