// scripts/test-vendor.js
const { https } = require("follow-redirects");

const options = {
  method: "GET",
  hostname: "VENDOR.GOYALSONS.COM",
  port: 99,
  path: "https://VENDOR.GOYALSONS.COM:99/gsweb_v3/webform2.aspx?sql=SELECT%20%0ASHRTNAME%2C%20DEPT%2C%20SMNO%2C%20%0A%20%20%20SM%2C%20EMAIL%2C%20BILL_MONTH%2C%20%0A%20%20%20BRAND%2C%20TOTAL_SALE%2C%20PR_DAYS%2C%20%0A%20%20%20INHOUSE_SAL%2CSYSDATE%20UPD_ON%0AFROM%20GSMT.SM_MONTHLY%0AWhere%20SMNO%20IN%20%28Select%20SMNO%20%20FROM%20GSMT.SM_MONTHLY%20where%20BILL_MONTH%20%3E%3D%20ADD_MONTHS%28SYSDATE%2C%20-2%29%20and%20TOTAL_SALE%20%3E%3D%20100%20%29&TYP=sql&key=ank2024",
  headers: {
    Authorization: "Bearer appscript_1Hxju6_SiFA9MsbbD1sFHJm5ak5yG0aB9qL4Q-wz6b2rbwdQciok89cT-_",
    // Cookie header optional if not required
  },
  maxRedirects: 20,
};

const req = https.request(options, (res) => {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => {
    const body = Buffer.concat(chunks).toString();
    console.log(body);
  });
  res.on("error", (error) => console.error(error));
});

req.on("error", (err) => console.error(err));
req.end();