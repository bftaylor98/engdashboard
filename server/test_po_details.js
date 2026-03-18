import 'dotenv/config';

// Test to find all available fields for a single purchase order
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

    if (body.data && body.data.purchaseOrder) {
      console.log(`✓ SUCCESS!`);
      console.log('\nPurchase Order Data:');
      console.log(JSON.stringify(body.data.purchaseOrder, null, 2));
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

    // Test various field combinations
    const fieldTests = [
      'notes', 'description', 'memo', 'comment',
      'poNumber', 'number', 'po', 'purchaseOrderNumber',
      'createdDate', 'created', 'dateCreated',
      'modifiedDate', 'modified', 'updatedDate', 'lastModified',
      'total', 'amount', 'grandTotal', 'subtotal',
      'currency', 'currencyCode',
      'terms', 'paymentTerms',
      'shipTo', 'shipToAddress', 'shippingAddress',
      'billTo', 'billToAddress', 'billingAddress',
      'requestedDate', 'requiredDate', 'expectedDate', 'dueDate',
      'approvedBy', 'approvedDate', 'approver',
      'reference', 'referenceNumber', 'refNumber',
    ];

    for (const field of fieldTests) {
      await testQuery(
        `Field: ${field}`,
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

    // Test if there's a separate query for line items
    await testQuery(
      'Separate query: purchaseOrderLineItems',
      `
        query GetPurchaseOrderLineItems($poId: String!) {
          purchaseOrderLineItems(poId: $poId) {
            id
            description
            quantity
            unitPrice
          }
        }
      `,
      { poId },
      token
    );

    await testQuery(
      'Separate query: purchaseOrderItems',
      `
        query GetPurchaseOrderItems($poId: String!) {
          purchaseOrderItems(poId: $poId) {
            id
            description
            quantity
            price
          }
        }
      `,
      { poId },
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

