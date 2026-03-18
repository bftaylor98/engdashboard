// Test querying PO 263146 specifically to find all available fields
const PROSHOP_CONFIG = {
  ROOT_URL: 'https://est.adionsystems.com',
  USERNAME: 'admin@esttool.com',
  PASSWORD: 'EstAdmin4626!!',
  SCOPE: 'nonconformancereports:r workorders:r parts:r users:r toolpots:r purchaseorders:r contacts:r',
};

async function getProshopToken() {
  const response = await fetch(`${PROSHOP_CONFIG.ROOT_URL}/api/beginsession`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: PROSHOP_CONFIG.USERNAME,
      password: PROSHOP_CONFIG.PASSWORD,
      scope: PROSHOP_CONFIG.SCOPE,
    }),
  });

  if (!response.ok) {
    throw new Error(`Proshop authentication failed: ${response.status}`);
  }

  const data = await response.json();
  return data.authorizationResult.token;
}

async function testQuery(name, query, variables, token) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  
  try {
    const response = await fetch(`${PROSHOP_CONFIG.ROOT_URL}/api/graphql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    const body = await response.json();
    
    if (body.errors) {
      console.log('✗ FAILED');
      body.errors.forEach(err => {
        console.log(`  Error: ${err.message}`);
      });
      return false;
    }

    if (body.data) {
      console.log(`✓ SUCCESS!`);
      console.log('\nResponse:');
      console.log(JSON.stringify(body.data, null, 2));
      return true;
    }
    
    console.log('✗ No data returned');
    return false;
  } catch (error) {
    console.log(`✗ ERROR: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    console.log('Authenticating with Proshop API...');
    const token = await getProshopToken();
    console.log('✓ Authenticated successfully');

    const poId = '263146';

    // Test 1: Basic query
    await testQuery(
      'Test 1: Basic PO query',
      `
        query GetPurchaseOrder($id: String!) {
          purchaseOrder(id: $id) {
            id
            cost
            date
            orderStatus
            supplier {
              name
            }
          }
        }
      `,
      { id: poId },
      token
    );

    // Test 2: Try line items with different field names
    const lineItemTests = [
      'lineItems { id description quantity unitPrice totalPrice }',
      'items { id description quantity price cost }',
      'purchaseOrderItems { id description quantity unitPrice }',
      'lines { id description quantity price }',
      'purchaseOrderLines { id description quantity }',
      'orderItems { id description quantity }',
    ];

    for (const lineItemQuery of lineItemTests) {
      await testQuery(
        `Test 2: Line items - ${lineItemQuery.split(' ')[0]}`,
        `
          query GetPurchaseOrder($id: String!) {
            purchaseOrder(id: $id) {
              id
              cost
              date
              orderStatus
              supplier {
                name
              }
              ${lineItemQuery}
            }
          }
        `,
        { id: poId },
        token
      );
    }

    // Test 3: Try other potential fields
    const otherFields = [
      'description', 'notes', 'comment', 'memo',
      'poNumber', 'number', 'purchaseOrderNumber',
      'createdDate', 'created', 'orderDate',
      'total', 'subtotal', 'tax', 'shipping',
    ];

    for (const field of otherFields) {
      await testQuery(
        `Test 3: Field - ${field}`,
        `
          query GetPurchaseOrder($id: String!) {
            purchaseOrder(id: $id) {
              id
              cost
              date
              orderStatus
              supplier {
                name
              }
              ${field}
            }
          }
        `,
        { id: poId },
        token
      );
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('Testing complete!');
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  }
}

main();


