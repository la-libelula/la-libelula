import assert from 'assert';

async function simulateSenderClaim(mockRpcData) {
  const groupIds = ['uuid1'];
  
  // Simulated alarmSender.js logic
  const claimData = mockRpcData;
  const claimErr = null; // We are testing data shape here
  
  if (claimErr || !claimData || claimData[0]?.updated_count !== groupIds.length) {
    return 'claim_failed';
  }
  return 'claim_success';
}

async function runDiagnostics() {
  console.log("--- DIAGNOSTIC: RPC RESPONSE SHAPES ---");
  
  const shapes = {
    A: 1,
    B: { updated_count: 1 },
    C: [{ updated_count: 1 }],
    D: "1",
    E: { updated_count: "1" },
    F: null,
    // The ACTUAL shape returned by Supabase for claim_alarm_group:
    G: [{ claimed_count: 1 }] 
  };

  for (const [name, shape] of Object.entries(shapes)) {
    const result = await simulateSenderClaim(shape);
    console.log(`Shape ${name}:`, JSON.stringify(shape), `=>`, result);
  }
}

runDiagnostics().catch(console.error);
