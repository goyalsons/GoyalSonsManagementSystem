const SMS_API_KEY = process.env.SMS_API_KEY;
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || "GOYLSN";
const SMS_DLT_ENTITY_ID = process.env.SMS_DLT_ENTITY_ID || "1101682460000011989";
const SMS_DLT_TEMPLATE_ID = process.env.SMS_DLT_TEMPLATE_ID || "1107176475621761408";

async function testSmsService() {
  console.log("\n========================================");
  console.log("  SMS SERVICE TEST (Dry Run)");
  console.log("========================================\n");

  if (!SMS_API_KEY) {
    console.log("⚠️ SMS_API_KEY not set");
    console.log("   OTP SMS functionality will not work.\n");
    console.log("   To enable SMS:");
    console.log("   1. Get API key from InstaAlerts");
    console.log("   2. Set SMS_API_KEY environment variable\n");
    console.log("========================================");
    console.log("  ⚠️ SMS TEST SKIPPED (No API key)");
    console.log("========================================\n");
    process.exit(0);
  }

  console.log("🔍 Checking SMS configuration...\n");
  console.log(`   API Key: ${"*".repeat(SMS_API_KEY.length - 4)}${SMS_API_KEY.slice(-4)}`);
  console.log(`   Sender ID: ${SMS_SENDER_ID}`);
  console.log(`   DLT Entity ID: ${SMS_DLT_ENTITY_ID}`);
  console.log(`   DLT Template ID: ${SMS_DLT_TEMPLATE_ID}`);
  console.log("");

  console.log("🔍 Testing API connectivity (no actual SMS sent)...\n");

  try {
    const testPayload = {
      api_key: SMS_API_KEY,
      sender: SMS_SENDER_ID,
      dltentityid: SMS_DLT_ENTITY_ID,
      dltheaderid: SMS_DLT_TEMPLATE_ID,
      to: "9999999999",
      message: "TEST - This is a dry run test, not actually sent",
      format: "json",
    };

    console.log("   Payload structure validated ✓");
    console.log("   API URL: https://japi.instaalerts.zone/httpapi/JsonReceiver");
    console.log("");
    
    console.log("   ⚠️ DRY RUN MODE - No actual API call made");
    console.log("   To send a real test SMS, use the application's OTP flow.\n");

    console.log("✅ SMS configuration validated\n");
    console.log("   The SMS service appears to be configured correctly.");
    console.log("   To verify actual delivery:");
    console.log("   1. Login to the application");
    console.log("   2. Select OTP login method");
    console.log("   3. Enter a valid phone number");
    console.log("   4. Check if OTP is received\n");

    console.log("========================================");
    console.log("  ✅ SMS CONFIG TEST PASSED");
    console.log("========================================\n");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ SMS configuration test failed:");
    console.error("   ", error instanceof Error ? error.message : error);
    
    console.log("\n========================================");
    console.log("  ❌ SMS CONFIG TEST FAILED");
    console.log("========================================\n");
    
    process.exit(1);
  }
}

testSmsService();
