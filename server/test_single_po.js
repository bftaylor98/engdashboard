import 'dotenv/config';

// Test querying a specific purchase order by ID
const PROSHOP_CONFIG = {
  ROOT_URL: process.env.PROSHOP_ROOT_URL,
  USERNAME: process.env.PROSHOP_USERNAME,
  PASSWORD: process.env.PROSHOP_PASSWORD,
  SCOPE: process.env.PROSHOP_SCOPE,
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
  console.log(`${'='.repeat(60)}`);
  console.log('Query:', query);
  console.log('Variables:', JSON.stringify(variables, null, 2));
  
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

    // Test 1: Query single PO by ID
    await testQuery(
      'Test 1: Query purchaseOrder by id',
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

    // Test 2: Try purchaseOrderDetails
    await testQuery(
      'Test 2: Query purchaseOrderDetails',
      `
        query GetPurchaseOrder($id: String!) {
          purchaseOrderDetails(id: $id) {
            id
            cost
            date
            orderStatus
          }
        }
      `,
      { id: poId },
      token
    );

    // Test 3: Try to get line items with purchaseOrder
    await testQuery(
      'Test 3: purchaseOrder with lineItems',
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
            lineItems {
              id
              description
              quantity
              unitPrice
            }
          }
        }
      `,
      { id: poId },
      token
    );

    // Test 4: Try items field
    await testQuery(
      'Test 4: purchaseOrder with items',
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
            items {
              id
              description
              quantity
              price
            }
          }
        }
      `,
      { id: poId },
      token
    );

    // Test 5: Try purchaseOrderLines
    await testQuery(
      'Test 5: purchaseOrder with purchaseOrderLines',
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
            purchaseOrderLines {
              id
              description
              quantity
              unitPrice
            }
          }
        }
      `,
      { id: poId },
      token
    );

    // Test 6: Try to get all fields from purchaseOrder
    await testQuery(
      'Test 6: purchaseOrder with all common fields',
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
            description
            notes
            createdDate
            modifiedDate
          }
        }
      `,
      { id: poId },
      token
    );

    // Test 7: Filter from purchaseOrders list to find the specific one
    await testQuery(
      'Test 7: Find PO in purchaseOrders list',
      `
        query GetPurchaseOrders($pageSize: Int!, $pageStart: Int!) {
          purchaseOrders(pageSize: $pageSize, pageStart: $pageStart) {
            totalRecords
            records {
              id
              cost
              date
              orderStatus
              supplier {
                name
              }
            }
          }
        }
      `,
      { pageSize: 500, pageStart: 0 },
      token
    );

    console.log(`\n${'='.repeat(60)}`);
    console.log('Testing complete!');
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  }
}

main();

