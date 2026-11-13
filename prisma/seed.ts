import { randomBytes, scryptSync } from "node:crypto";
import { prisma } from "../lib/prisma.js";

type CurrencyCode = "NAIRA" | "DOLLAR";
type OrderStatusCode =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

interface SeedProduct {
  name: string;
  slug: string;
  sku: string;
  description: string;
  category: string;
  stock_quantity: number;
  is_active: boolean;
  prices: Partial<Record<CurrencyCode, bigint>>; // kobo / cent
  image: string;
}

interface SeedStore {
  slug: string;
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "SUSPENDED";
  planCode: string;
  members: { username: string; role: "OWNER" | "ADMIN" | "STAFF" }[];
  currencies: CurrencyCode[];
  domain: string | null;
  appearance: {
    logo_url?: string;
    cover_image?: string;
    bg_mode?: "light" | "dark";
    background_color?: string;
  };
  bank: { bank_name: string; account_name: string; account_number: string };
  paystack: boolean;
  categories: { name: string; slug: string }[];
  products: SeedProduct[];
}

interface ProductRef {
  id: number;
  name: string;
  price: bigint;
  description: string;
  image: string;
}

const plans = [
  {
    name: "Free",
    code: "FREE",
    duration: "MONTHLY",
    monthly_price: 0n,
    currency: "NAIRA" as const,
    max_products: 10n,
  },
  {
    name: "Starter",
    code: "STARTER",
    duration: "MONTHLY",
    monthly_price: 500000n, // ₦5,000
    currency: "NAIRA" as const,
    max_products: 100n,
  },
  {
    name: "Pro",
    code: "PRO",
    duration: "MONTHLY",
    monthly_price: 1500000n, // ₦15,000
    currency: "NAIRA" as const,
    max_products: 1000n,
  },
];

// ---------- Users ----------

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "ChangeMe123!";

// Swap this for bcrypt/argon2 if that's what your auth code verifies against.
function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

const users = [
  {
    username: "admin",
    email: "admin@example.com",
    first_name: "Ada",
    last_name: "Admin",
    role: "ADMIN" as const,
    address: "1 Admin Street, Ikeja, Lagos",
  },
  {
    username: "merchant",
    email: "merchant@example.com",
    first_name: "Tunde",
    last_name: "Bakare",
    role: "MERCHANT" as const,
    address: "12 Market Road, Yaba, Lagos",
  },
  {
    username: "staff",
    email: "staff@example.com",
    first_name: "Ngozi",
    last_name: "Eze",
    role: "MERCHANT" as const,
    address: "5 Allen Avenue, Ikeja, Lagos",
  },
  {
    username: "customer",
    email: "customer@example.com",
    first_name: "Chidi",
    last_name: "Okafor",
    role: "USER" as const,
    address: "8 Admiralty Way, Lekki, Lagos",
  },
];

async function seedUsers() {
  const byUsername: Record<string, { id: number; email: string }> = {};

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        first_name: u.first_name,
        last_name: u.last_name,
        role: u.role,
        address: u.address,
      },
      create: { ...u, password_hash: hashPassword(SEED_PASSWORD) },
    });

    await prisma.profile.upsert({
      where: { user_id: user.id },
      update: {},
      create: {
        user_id: user.id,
        bg_mode: "light",
        shipping_addresses: [u.address],
      },
    });

    byUsername[u.username] = user;
    console.log(`Seeded user + profile: ${u.email}`);
  }

  return byUsername;
}

// ---------- Stores, catalog ----------

const stores: SeedStore[] = [
  {
    slug: "spectre-gadgets",
    name: "Spectre Gadgets",
    description: "Phones, laptops and accessories.",
    status: "ACTIVE",
    planCode: "PRO",
    members: [
      { username: "merchant", role: "OWNER" },
      { username: "staff", role: "STAFF" },
    ],
    currencies: ["NAIRA", "DOLLAR"],
    domain: "gadgets.example.com",
    appearance: {
      logo_url: "https://placehold.co/200x200?text=SG",
      cover_image: "https://placehold.co/1200x400?text=Spectre+Gadgets",
      bg_mode: "dark",
      background_color: "#0f172a",
    },
    bank: {
      bank_name: "GTBank",
      account_name: "Spectre Gadgets Ltd",
      account_number: "0123456789",
    },
    paystack: true,
    categories: [
      { name: "Phones", slug: "phones" },
      { name: "Accessories", slug: "accessories" },
    ],
    products: [
      {
        name: "Spectre Phone X",
        slug: "spectre-phone-x",
        sku: "SPX-001",
        description: "6.7 inch display, 256GB storage.",
        category: "phones",
        stock_quantity: 25,
        is_active: true,
        prices: { NAIRA: 45000000n, DOLLAR: 30000n },
        image: "https://placehold.co/600x600?text=Phone+X",
      },
      {
        name: "USB-C Fast Charger",
        slug: "usb-c-fast-charger",
        sku: "CHG-001",
        description: "65W USB-C fast charger.",
        category: "accessories",
        stock_quantity: 200,
        is_active: true,
        prices: { NAIRA: 1500000n, DOLLAR: 1200n },
        image: "https://placehold.co/600x600?text=Charger",
      },
      {
        name: "Phone Case",
        slug: "phone-case",
        sku: "CASE-001",
        description: "Shockproof case for Spectre Phone X.",
        category: "accessories",
        stock_quantity: 0,
        is_active: false,
        prices: { NAIRA: 500000n },
        image: "https://placehold.co/600x600?text=Case",
      },
    ],
  },
  {
    slug: "ade-fashion",
    name: "Ade Fashion",
    description: "Ankara and contemporary African wear.",
    status: "DRAFT",
    planCode: "FREE",
    members: [{ username: "merchant", role: "OWNER" }],
    currencies: ["NAIRA"],
    domain: null,
    appearance: {
      logo_url: "https://placehold.co/200x200?text=AF",
      cover_image: "https://placehold.co/1200x400?text=Ade+Fashion",
      bg_mode: "light",
      background_color: "#fff7ed",
    },
    bank: {
      bank_name: "Access Bank",
      account_name: "Ade Fashion",
      account_number: "9876543210",
    },
    paystack: false,
    categories: [{ name: "Dresses", slug: "dresses" }],
    products: [
      {
        name: "Ankara Wrap Dress",
        slug: "ankara-wrap-dress",
        sku: "AWD-001",
        description: "Hand-stitched Ankara wrap dress.",
        category: "dresses",
        stock_quantity: 15,
        is_active: true,
        prices: { NAIRA: 2500000n },
        image: "https://placehold.co/600x600?text=Dress",
      },
    ],
  },
  {
    slug: "lagos-books",
    name: "Lagos Books",
    description: "New and used books, shipped nationwide.",
    status: "SUSPENDED",
    planCode: "STARTER",
    members: [
      { username: "staff", role: "OWNER" },
      { username: "merchant", role: "ADMIN" },
    ],
    currencies: ["NAIRA"],
    domain: "books.example.com",
    appearance: {
      logo_url: "https://placehold.co/200x200?text=LB",
      cover_image: "https://placehold.co/1200x400?text=Lagos+Books",
      bg_mode: "light",
      background_color: "#f0fdf4",
    },
    bank: {
      bank_name: "Zenith Bank",
      account_name: "Lagos Books",
      account_number: "1122334455",
    },
    paystack: false,
    categories: [{ name: "Fiction", slug: "fiction" }],
    products: [
      {
        name: "Things Fall Apart",
        slug: "things-fall-apart",
        sku: "BK-001",
        description: "Chinua Achebe's classic novel, paperback.",
        category: "fiction",
        stock_quantity: 40,
        is_active: true,
        prices: { NAIRA: 800000n },
        image: "https://placehold.co/600x600?text=Book",
      },
    ],
  },
];

async function seedStores(userMap: Record<string, { id: number }>) {
  const storeIds: Record<string, number> = {};
  const providerIds: Record<string, number> = {};
  const products: Record<string, ProductRef> = {}; // key: `${storeSlug}:${productSlug}`

  for (const s of stores) {
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { code: s.planCode },
    });

    const store = await prisma.store.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        description: s.description,
        status: s.status,
        plan_id: plan.id,
      },
      create: {
        slug: s.slug,
        name: s.name,
        description: s.description,
        status: s.status,
        plan_id: plan.id,
        default_currency: "NAIRA",
      },
    });
    storeIds[s.slug] = store.id;

    for (const m of s.members) {
      await prisma.storeMembership.upsert({
        where: {
          store_id_user_id: {
            store_id: store.id,
            user_id: userMap[m.username].id,
          },
        },
        update: { role: m.role },
        create: {
          store_id: store.id,
          user_id: userMap[m.username].id,
          role: m.role,
        },
      });
    }

    for (const currency of s.currencies) {
      await prisma.storeCurrency.upsert({
        where: { store_id_currency: { store_id: store.id, currency } },
        update: {},
        create: { store_id: store.id, currency },
      });
    }

    if (s.domain) {
      await prisma.storeDomain.upsert({
        where: { domain: s.domain },
        update: { store_id: store.id },
        create: { store_id: store.id, domain: s.domain },
      });
    }

    await prisma.storeAppearance.upsert({
      where: { store_id: store.id },
      update: s.appearance,
      create: { store_id: store.id, ...s.appearance },
    });

    const existingBank = await prisma.storeBankAccount.findFirst({
      where: { store_id: store.id, account_number: s.bank.account_number },
    });
    if (!existingBank) {
      await prisma.storeBankAccount.create({
        data: { store_id: store.id, ...s.bank },
      });
    }

    if (s.paystack) {
      const provider = await prisma.storePaymentProvider.upsert({
        where: {
          store_id_provider: { store_id: store.id, provider: "paystack" },
        },
        update: { is_enabled: true },
        create: {
          store_id: store.id,
          provider: "paystack",
          public_key: "pk_test_seed_placeholder",
          // Placeholders, NOT real ciphertext. Replace if your app decrypts these.
          secret_key: "seed-placeholder-ciphertext",
          webhook_secret: "seed-placeholder-ciphertext",
          is_enabled: true,
        },
      });
      providerIds[s.slug] = provider.id;
    }

    const categoryIds: Record<string, number> = {};
    for (const c of s.categories) {
      const category = await prisma.category.upsert({
        where: { store_id_slug: { store_id: store.id, slug: c.slug } },
        update: { name: c.name },
        create: { store_id: store.id, name: c.name, slug: c.slug },
      });
      categoryIds[c.slug] = category.id;
    }

    for (const p of s.products) {
      const product = await prisma.product.upsert({
        where: { store_id_slug: { store_id: store.id, slug: p.slug } },
        update: {
          name: p.name,
          description: p.description,
          sku: p.sku,
          stock_quantity: p.stock_quantity,
          is_active: p.is_active,
          category_id: categoryIds[p.category],
        },
        create: {
          store_id: store.id,
          category_id: categoryIds[p.category],
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          description: p.description,
          stock_quantity: p.stock_quantity,
          is_active: p.is_active,
        },
      });

      for (const [currency, amount] of Object.entries(p.prices) as [
        CurrencyCode,
        bigint,
      ][]) {
        await prisma.productPrice.upsert({
          where: {
            product_id_currency: {
              product_id: product.id,
              currency,
            },
          },
          update: { amount },
          create: {
            product_id: product.id,
            currency,
            amount,
          },
        });
      }

      const existingImage = await prisma.productImages.findFirst({
        where: { product_id: product.id, image_url: p.image },
      });
      if (!existingImage) {
        await prisma.productImages.create({
          data: {
            product_id: product.id,
            image_url: p.image,
            alt_text: p.name,
          },
        });
      }

      products[`${s.slug}:${p.slug}`] = {
        id: product.id,
        name: p.name,
        price: p.prices.NAIRA ?? 0n,
        description: p.description,
        image: p.image,
      };
    }

    console.log(`Seeded store: ${s.name}`);
  }

  return { storeIds, providerIds, products };
}

// ---------- Cart, orders, payments, webhooks ----------

async function createOrder(args: {
  storeId: number;
  userId: number;
  email: string;
  orderNumber: string;
  status: OrderStatusCode;
  shippingFee: bigint;
  items: { ref: ProductRef; quantity: number }[];
}) {
  const subTotal = args.items.reduce(
    (sum, i) => sum + i.ref.price * BigInt(i.quantity),
    0n,
  );

  const order = await prisma.orders.upsert({
    where: {
      store_id_order_number: {
        store_id: args.storeId,
        order_number: args.orderNumber,
      },
    },
    update: { status: args.status },
    create: {
      store_id: args.storeId,
      user_id: args.userId,
      order_number: args.orderNumber,
      status: args.status,
      sub_total: subTotal,
      shipping_fee: args.shippingFee,
      total: subTotal + args.shippingFee,
      currency: "NAIRA",
      shipping_name: "Chidi Okafor",
      shipping_phone: "+2348012345678",
      shipping_address: "8 Admiralty Way, Lekki, Lagos",
      shipping_mail: args.email,
    },
  });

  for (const item of args.items) {
    const existing = await prisma.orderItems.findFirst({
      where: { order_id: order.id, product_id: item.ref.id },
    });
    if (!existing) {
      await prisma.orderItems.create({
        data: {
          order_id: order.id,
          product_id: item.ref.id,
          product_name: item.ref.name,
          unit_price: item.ref.price,
          quantity: item.quantity,
          userId: args.userId,
          product_description: item.ref.description,
          product_image: item.ref.image,
        },
      });
    }
  }

  return order;
}

async function seedCartAndOrders(
  userMap: Record<string, { id: number; email: string }>,
  catalog: Awaited<ReturnType<typeof seedStores>>,
) {
  const slug = "spectre-gadgets";
  const storeId = catalog.storeIds[slug];
  const providerId = catalog.providerIds[slug];
  const customer = userMap.customer;
  const merchant = userMap.merchant;

  const phone = catalog.products[`${slug}:spectre-phone-x`];
  const charger = catalog.products[`${slug}:usb-c-fast-charger`];

  // Cart
  const cart = await prisma.cart.upsert({
    where: { store_id_user_id: { store_id: storeId, user_id: customer.id } },
    update: {},
    create: { store_id: storeId, user_id: customer.id },
  });
  for (const [ref, quantity] of [
    [phone, 1],
    [charger, 2],
  ] as const) {
    await prisma.cartItem.upsert({
      where: { cart_id_product_id: { cart_id: cart.id, product_id: ref.id } },
      update: { quantity },
      create: {
        cart_id: cart.id,
        store_id: storeId,
        product_id: ref.id,
        quantity,
      },
    });
  }

  // Order 1: delivered, paid via Paystack, webhook processed
  const order1 = await createOrder({
    storeId,
    userId: customer.id,
    email: customer.email,
    orderNumber: "ORD-1001",
    status: "DELIVERED",
    shippingFee: 250000n,
    items: [
      { ref: phone, quantity: 1 },
      { ref: charger, quantity: 2 },
    ],
  });
  await prisma.payment.upsert({
    where: { reference: "PAY-SEED-0001" },
    update: {},
    create: {
      order_id: order1.id,
      store_id: storeId,
      provider_config_id: providerId,
      userId: customer.id,
      reference: "PAY-SEED-0001",
      provider_reference: "psk_seed_0001",
      payment_method: "PROVIDER",
      amount: order1.total,
      currency: "NAIRA",
      status: "SUCCESSFUL",
      paid_at: new Date(),
      verified_at: new Date(),
      verification_source: "PROVIDER_WEBHOOK",
    },
  });
  await prisma.paymentWebhookEvent.upsert({
    where: {
      provider_config_id_event_id: {
        provider_config_id: providerId,
        event_id: "evt_seed_0001",
      },
    },
    update: {},
    create: {
      provider_config_id: providerId,
      event_id: "evt_seed_0001",
      event_type: "charge.success",
      status: "PROCESSED",
      payload: {
        event: "charge.success",
        data: { reference: "PAY-SEED-0001", amount: Number(order1.total) },
      },
      processed_at: new Date(),
      attempts: 1,
    },
  });

  // Order 2: bank transfer, proof submitted, awaiting merchant verification
  const order2 = await createOrder({
    storeId,
    userId: customer.id,
    email: customer.email,
    orderNumber: "ORD-1002",
    status: "PENDING",
    shippingFee: 250000n,
    items: [{ ref: charger, quantity: 1 }],
  });
  await prisma.payment.upsert({
    where: { reference: "PAY-SEED-0002" },
    update: {},
    create: {
      order_id: order2.id,
      store_id: storeId,
      userId: customer.id,
      reference: "PAY-SEED-0002",
      payment_method: "BANK_TRANSFER",
      amount: order2.total,
      currency: "NAIRA",
      status: "AWAITING_VERIFICATION",
      submitted_at: new Date(),
      proof_url: "https://placehold.co/600x800?text=Transfer+Receipt",
    },
  });

  // Order 3: pay on delivery, confirmed, payment still pending
  const order3 = await createOrder({
    storeId,
    userId: customer.id,
    email: customer.email,
    orderNumber: "ORD-1003",
    status: "CONFIRMED",
    shippingFee: 250000n,
    items: [{ ref: phone, quantity: 1 }],
  });
  await prisma.payment.upsert({
    where: { reference: "PAY-SEED-0003" },
    update: {},
    create: {
      order_id: order3.id,
      store_id: storeId,
      userId: customer.id,
      reference: "PAY-SEED-0003",
      payment_method: "ON_DELIVERY",
      amount: order3.total,
      currency: "NAIRA",
      status: "PENDING",
    },
  });

  // Order 4: cancelled, payment refunded, provider webhook failed
  const order4 = await createOrder({
    storeId,
    userId: customer.id,
    email: customer.email,
    orderNumber: "ORD-1004",
    status: "CANCELLED",
    shippingFee: 250000n,
    items: [{ ref: charger, quantity: 1 }],
  });
  await prisma.payment.upsert({
    where: { reference: "PAY-SEED-0004" },
    update: {},
    create: {
      order_id: order4.id,
      store_id: storeId,
      provider_config_id: providerId,
      userId: customer.id,
      reference: "PAY-SEED-0004",
      provider_reference: "psk_seed_0004",
      payment_method: "PROVIDER",
      amount: order4.total,
      currency: "NAIRA",
      status: "REFUNDED",
      paid_at: new Date(),
    },
  });
  await prisma.paymentWebhookEvent.upsert({
    where: {
      provider_config_id_event_id: {
        provider_config_id: providerId,
        event_id: "evt_seed_0002",
      },
    },
    update: {},
    create: {
      provider_config_id: providerId,
      event_id: "evt_seed_0002",
      event_type: "charge.success",
      status: "FAILED",
      payload: {
        event: "charge.success",
        data: { reference: "PAY-SEED-0004" },
      },
      failure_reason: "Order was cancelled before the webhook was processed",
      attempts: 3,
    },
  });

  // Order 5: processing, bank transfer manually verified by the merchant
  const order5 = await createOrder({
    storeId,
    userId: customer.id,
    email: customer.email,
    orderNumber: "ORD-1005",
    status: "PROCESSING",
    shippingFee: 250000n,
    items: [{ ref: charger, quantity: 3 }],
  });
  await prisma.payment.upsert({
    where: { reference: "PAY-SEED-0005" },
    update: {},
    create: {
      order_id: order5.id,
      store_id: storeId,
      userId: customer.id,
      reference: "PAY-SEED-0005",
      payment_method: "BANK_TRANSFER",
      amount: order5.total,
      currency: "NAIRA",
      status: "SUCCESSFUL",
      submitted_at: new Date(),
      proof_url: "https://placehold.co/600x800?text=Transfer+Receipt",
      verified_at: new Date(),
      verified_by_user_id: merchant.id,
      verification_source: "MANUAL",
    },
  });

  console.log("Seeded cart, 5 orders, payments and webhook events");
}

async function seed() {
  console.log("Starting database seeding...");

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        duration: plan.duration,
        monthly_price: plan.monthly_price,
        currency: plan.currency,
        max_products: plan.max_products,
      },
      create: plan,
    });

    console.log(`Seeded plan: ${plan.name}`);
  }

  const userMap = await seedUsers();
  const catalog = await seedStores(userMap);
  await seedCartAndOrders(userMap, catalog);

  console.log("Database seeding completed.");
}

seed()
  .catch((error) => {
    console.error("Database seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
