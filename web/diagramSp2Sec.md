# Sequence diagrams

The following diagrams describe the implemented purchase, payment, point-of-sale, receipt, and automatic inventory flows. HTML comments preserve traceability without adding use-case identifiers or names to rendered diagram titles.

<!-- CU17 -->
```plantuml
@startuml
actor Cliente
boundary "Purchase modal" as Checkout
boundary "Card payment widget" as CardWidget
control "PaymentsService" as Payments
control "SalesService" as Sales
participant "Payments API" as PaymentsAPI
participant "Stripe" as Stripe
participant "Sales API" as SalesAPI
database "Database" as DB
boundary "Receipt modal" as Receipt

Cliente -> Checkout: Start checkout with a cart snapshot
Checkout -> Payments: Create payment intent(items, idempotency key)
Payments -> PaymentsAPI: POST /api/payments/intents
PaymentsAPI -> DB: Validate products and available stock

alt Product or stock validation fails
  DB --> PaymentsAPI: Invalid item or insufficient stock
  PaymentsAPI --> Payments: 400 error
  Payments --> Checkout: No intent
  Checkout --> Cliente: Show error and allow closing
else Items are available
  PaymentsAPI -> Stripe: Create Payment Intent(server-calculated total)
  Stripe --> PaymentsAPI: clientSecret and intent ID
  PaymentsAPI --> Payments: Payment intent
  Payments --> Checkout: clientSecret
  Checkout -> CardWidget: Display card form(clientSecret)
  CardWidget --> Cliente: Request card confirmation

  Cliente -> CardWidget: Confirm card payment
  CardWidget -> Stripe: confirmPayment
  alt Payment is cancelled or rejected
    Stripe --> CardWidget: Cancellation or error
    CardWidget --> Checkout: Payment not completed
    Checkout --> Cliente: Keep checkout open or close it
  else Stripe reports a payment intent
    Stripe --> CardWidget: paymentIntentId
    CardWidget --> Checkout: paymentIntentId
    Checkout -> Payments: Verify payment intent
    Payments -> PaymentsAPI: POST /api/payments/intents/{id}/verify
    PaymentsAPI -> Stripe: Retrieve Payment Intent
    Stripe --> PaymentsAPI: Authoritative payment status

    alt Payment is not confirmed by the server
      PaymentsAPI --> Payments: pagado = false
      Payments --> Checkout: Payment not verified
      Checkout --> Cliente: Do not create the sale
    else Payment is confirmed
      PaymentsAPI -> DB: Create or reuse MetodoPago
      DB --> PaymentsAPI: idMetPago
      PaymentsAPI --> Payments: Verified payment
      Payments --> Checkout: idMetPago
      Checkout -> Sales: Create sale(items, idMetPago)
      Sales -> SalesAPI: POST /api/sales
      SalesAPI -> DB: Resolve authenticated Cliente,\nvalidate payment and stock,\npersist sale and inventory changes

      alt Sale persistence fails after payment
        DB --> SalesAPI: Transaction failure
        SalesAPI --> Sales: Error
        Sales --> Checkout: Sale not created
        Checkout --> Cliente: Offer retry with the same idMetPago
        Cliente -> Checkout: Retry purchase
        Checkout -> Sales: Create sale(items, retained idMetPago)
      else Sale is committed
        DB --> SalesAPI: Venta with server totals and details
        SalesAPI --> Sales: Venta
        Sales --> Checkout: Purchase completed
        Checkout -> Receipt: Render confirmed Venta
        Receipt --> Cliente: Display receipt
      end
    end
  end
end
@enduml
```

<!-- CU18 -->
```plantuml
@startuml
actor Cliente
boundary "Checkout or POS" as Caller
boundary "Card payment widget" as CardWidget
control "PaymentsService" as Payments
participant "Payments API" as PaymentsAPI
participant "Stripe API" as Stripe
database "MetodoPago store" as PaymentStore
database "Product and inventory store" as InventoryStore

Cliente -> Caller: Request card payment
Caller -> Payments: Create payment intent(items, idempotency key)
Payments -> PaymentsAPI: POST /api/payments/intents
PaymentsAPI -> InventoryStore: Validate items and stock; calculate amount

alt Item or stock validation fails
  InventoryStore --> PaymentsAPI: Invalid item or insufficient stock
  PaymentsAPI --> Payments: Error
  Payments --> Caller: Payment cannot start
  Caller --> Cliente: Show failure without charging
else Intent is created
  InventoryStore --> PaymentsAPI: Validated amount
  PaymentsAPI -> Stripe: Create Payment Intent(server-calculated amount)
  Stripe --> PaymentsAPI: clientSecret
  PaymentsAPI --> Payments: Payment intent
  Payments --> Caller: clientSecret
  Caller -> CardWidget: Open card payment form(clientSecret)
  CardWidget -> Payments: Load Stripe.js
  Payments --> CardWidget: Stripe client
  CardWidget -> Stripe: Mount Payment Element(clientSecret)

  Cliente -> CardWidget: Confirm payment
  CardWidget -> Stripe: confirmPayment(redirect if required)

  alt Stripe rejects the payment
    Stripe --> CardWidget: Payment error
    CardWidget --> Cliente: Show rejection and allow retry
  else Cliente cancels
    Cliente -> CardWidget: Cancel
    CardWidget --> Cliente: Close payment flow
  else Stripe returns a Payment Intent
    Stripe --> CardWidget: paymentIntentId
    CardWidget -> Payments: Verify payment(paymentIntentId)
    Payments -> PaymentsAPI: POST /api/payments/intents/{id}/verify
    PaymentsAPI -> Stripe: Retrieve Payment Intent
    Stripe --> PaymentsAPI: status, amount, currency, metadata

    alt Status is not succeeded
      PaymentsAPI --> Payments: pagado = false
      Payments --> CardWidget: Payment is not authoritative
      CardWidget --> Cliente: Keep sale unconfirmed
    else Status is succeeded
      PaymentsAPI -> PaymentStore: Find by stripePaymentIntentId
      alt MetodoPago already exists
        PaymentStore --> PaymentsAPI: Existing idMetPago
      else First successful verification
        PaymentsAPI -> PaymentStore: Persist active card MetodoPago
        PaymentStore --> PaymentsAPI: New idMetPago
      end
      PaymentsAPI --> Payments: pagado = true, idMetPago, amount
      Payments --> CardWidget: Verified payment reference
      CardWidget --> Cliente: Continue to sale registration
    end
  end
end
@enduml
```

<!-- CU19 -->
```plantuml
@startuml
actor Cajero
boundary "POS screen" as POS
participant "Inventory API" as InventoryAPI
participant "Customers API" as CustomersAPI
participant "Products API" as ProductsAPI
control "SalesService" as Sales
participant "Sales API" as SalesAPI
database "Database" as DB

Cajero -> POS: Open point-of-sale screen
par Load branches
  POS -> InventoryAPI: GET /api/inventory/locations
  InventoryAPI --> POS: Branches
else Load customers
  POS -> CustomersAPI: GET /api/customers
  CustomersAPI --> POS: Clientes
end

Cajero -> POS: Select branch
POS -> InventoryAPI: GET /api/inventory/stock?codigoSucursal
InventoryAPI --> POS: Branch stock

loop For each ticket item
  Cajero -> POS: Add product
  POS -> ProductsAPI: GET /api/products/{id}
  ProductsAPI --> POS: Product and authoritative unit price
  POS --> Cajero: Update ticket and indicative subtotal
end

Cajero -> POS: Select Cliente and payment modality
ref over Cajero, POS: Complete cash or card payment
POS -> Sales: Create sale(Cliente, branch, idMetPago, items)
Sales -> SalesAPI: POST /api/sales
SalesAPI -> DB: Validate Cliente, payment, products,\nand branch-scoped stock

alt Sale data or stock is invalid
  DB --> SalesAPI: Validation failure
  SalesAPI --> Sales: Error
  Sales --> POS: Sale not created
  POS --> Cajero: Retain idMetPago and offer retry
  Cajero -> POS: Retry with corrected branch
  POS -> Sales: Reuse the same idMetPago
else Sale is valid
  SalesAPI -> DB: Persist Venta, details, totals,\ninventory movements, history, and audit entry
  DB --> SalesAPI: Committed Venta
  SalesAPI --> Sales: Venta with server-calculated data
  Sales --> POS: Registration completed
  POS --> Cajero: Display receipt
end
@enduml
```

<!-- CU20 -->
```plantuml
@startuml
actor Cajero
boundary "POS screen" as POS
control "SalesService" as Sales
control "PaymentsService" as Payments
boundary "Card payment widget" as CardWidget
participant "Payment methods API" as PaymentMethodsAPI
participant "Payments API" as PaymentsAPI
participant "Stripe" as Stripe
participant "Sales API" as SalesAPI
boundary "Receipt modal" as Receipt

Cajero -> POS: Confirm customer, branch, ticket, and modality

alt Cash
  POS -> Sales: Create cash payment method(indicative subtotal)
  Sales -> PaymentMethodsAPI: POST /api/payment-methods
  alt Cash payment method cannot be recorded
    PaymentMethodsAPI --> Sales: Error
    Sales --> POS: Return to editable ticket
  else Cash payment method is recorded
    PaymentMethodsAPI --> Sales: idMetPago
    Sales --> POS: Payment reference
  end
else Card
  POS -> POS: Revalidate branch stock snapshot
  alt Stock is insufficient
    POS --> Cajero: Require another branch or ticket change
  else Stock is sufficient
    POS -> Payments: Create payment intent(items, idempotency key)
    Payments -> PaymentsAPI: POST /api/payments/intents
    PaymentsAPI -> Stripe: Create Payment Intent
    Stripe --> PaymentsAPI: clientSecret
    PaymentsAPI --> Payments: Payment intent
    Payments --> POS: clientSecret
    POS -> CardWidget: Display card form
    Cajero -> CardWidget: Confirm payment
    CardWidget -> Stripe: confirmPayment

    alt Card is cancelled or rejected
      Stripe --> CardWidget: Cancellation or error
      CardWidget --> POS: Return without idMetPago
      POS --> Cajero: Keep ticket pending
    else Stripe returns an intent
      Stripe --> CardWidget: paymentIntentId
      CardWidget -> POS: Payment intent ID
      POS -> Payments: Verify payment intent
      Payments -> PaymentsAPI: POST /api/payments/intents/{id}/verify
      PaymentsAPI -> Stripe: Retrieve authoritative status
      Stripe --> PaymentsAPI: succeeded
      PaymentsAPI --> Payments: idMetPago and amount
      Payments --> POS: Verified payment reference
    end
  end
end

opt A payment reference is available
  POS -> Sales: Create sale with idMetPago
  Sales -> SalesAPI: POST /api/sales
  alt Sale creation fails
    SalesAPI --> Sales: Error
    Sales --> POS: Retain idMetPago
    POS --> Cajero: Retry without charging again or abandon
  else Sale creation succeeds
    SalesAPI --> Sales: Confirmed Venta with details and total
    Sales --> POS: Venta
    POS -> Receipt: Render server-confirmed data
    Receipt --> Cajero: Display comprobante
    Cajero -> Receipt: Print
    Receipt -> Receipt: window.print()
  end
end
@enduml
```

<!-- CU21 -->
```plantuml
@startuml
participant "Sales API" as SalesAPI
control "Automatic inventory process" as InventoryProcess
database "Product and inventory store" as InventoryStore
database "Sales records" as SalesStore
database "Movement and history records" as HistoryStore
database "Audit log" as AuditStore

SalesAPI -> InventoryProcess: Process validated sale items
InventoryProcess -> SalesStore: Create pending Venta
SalesStore --> InventoryProcess: idVenta

loop For each sale item
  InventoryProcess -> InventoryStore: Load Producto
  InventoryStore --> InventoryProcess: Product and current price
  InventoryProcess -> InventoryStore: Resolve one inventory row
  note right
    POS: use the selected branch.
    Digital purchase: choose one branch
    that can satisfy the full quantity.
  end note

  alt Product or sufficient stock is unavailable
    InventoryStore --> InventoryProcess: Validation failure
    InventoryProcess -> SalesStore: Roll back pending transaction
    InventoryProcess --> SalesAPI: Reject sale; stock remains unchanged
  else Inventory is available
    InventoryStore --> InventoryProcess: Inventory row
    InventoryProcess -> InventoryStore: Decrease cantidad_actual
    InventoryProcess -> SalesStore: Add DetalleVenta with current price
    InventoryProcess -> HistoryStore: Add negative venta Movimiento
    InventoryProcess -> HistoryStore: Add customer purchase Historial
  end
end

InventoryProcess -> SalesStore: Set server-calculated total
InventoryProcess -> AuditStore: Record sale creation
InventoryProcess -> SalesStore: Commit transaction
SalesStore --> InventoryProcess: Committed Venta and details
InventoryProcess --> SalesAPI: Updated inventory and confirmed sale
@enduml
```
