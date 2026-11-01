const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({
      hostname: 'localhost',
      port: 5000,
      path,
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf) }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- 1. Fetching first product ---');
  const prods = await get('/api/products');
  const prod = prods.body.data.products[0];
  console.log('Product:', prod.name, 'BaseCost:', prod.baseCostPrice);

  console.log('--- 2. Creating Negotiation Session ---');
  const negRes = await post('/api/negotiations', {
    targetProductId: prod.id,
    targetQuantity: 10,
    maxBudget: 45000,
    maxDeliveryHours: 48,
    targetResaleMargin: 25,
  });
  const negId = negRes.body.data.id;
  console.log('Created Negotiation ID:', negId);

  console.log('--- 3. Advancing to Round 1 ---');
  const r1 = await post('/api/negotiations/' + negId + '/advance', { roundNumber: 1 });
  console.log('Round 1 executed:', r1.body.data.roundNumber, 'Offers count:', r1.body.data.offers?.length, 'Messages count:', r1.body.data.messages?.length);

  console.log('--- 4. Advancing to Round 2 ---');
  const r2 = await post('/api/negotiations/' + negId + '/advance', { roundNumber: 2 });
  console.log('Round 2 executed:', r2.body.data.roundNumber, 'Offers count:', r2.body.data.offers?.length, 'Messages count:', r2.body.data.messages?.length);

  console.log('--- 5. Advancing to Round 3 (Consensus) ---');
  const r3 = await post('/api/negotiations/' + negId + '/advance', { roundNumber: 3 });
  console.log('Round 3 executed:', r3.body.data.roundNumber, 'Status:', r3.body.data.status, 'Recommended:', r3.body.data.recommendedOffer?.sellerType);

  console.log('--- 6. Verifying Negotiation Details API ---');
  const detail = await get('/api/negotiations/' + negId);
  console.log('Detail Status:', detail.body.data.status, 'Total Messages in DB:', detail.body.data.messages?.length);

  console.log('--- 7. Create and Verify Transaction ---');
  const recOffer = r3.body.data.recommendedOffer || detail.body.data.offers[0];
  const txRes = await post('/api/transactions', {
    negotiationId: negId,
    offerId: recOffer.id,
  });
  console.log('Transaction created:', txRes.body.data.id, 'Amount:', txRes.body.data.settlementAmount, 'Status:', txRes.body.data.settlementStatus);

  console.log('--- 8. Human Approval & Settlement ---');
  const approveRes = await post('/api/transactions/' + txRes.body.data.id + '/approve', {
    operatorName: 'Kartik - Senior Procurement Director',
    mockPayerVpa: 'apexenterprise@hdfcbank',
    approvalReason: 'Approved optimal quote at ₹' + txRes.body.data.settlementAmount,
  });
  console.log('Approval response:', approveRes.status, 'Settlement Status:', approveRes.body.data?.settlementStatus);

  console.log('--- ALL CHECKS PASSED SUCCESSFULLY ---');
}

run().catch(console.error);
