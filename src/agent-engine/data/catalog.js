/**
 * 40 Realistic B2B Procurement SKUs
 * Covering 5 key B2B industrial & enterprise categories.
 */

const RAW_SKUS = [
  // Category 1: Commercial Electronics & IT (10 SKUs)
  { sku: "ELEC-RT-001", name: "Enterprise Wi-Fi 6 Mesh Router", category: "Electronics", unit: "Unit", baseCost: 3200, minPrice: 3500, targetPrice: 4200, stock: 120, leadTime: 24, grade: "Enterprise" },
  { sku: "ELEC-PB-002", name: "20,000mAh Rugged Power Bank PD 65W", category: "Electronics", unit: "Unit", baseCost: 1100, minPrice: 1250, targetPrice: 1600, stock: 350, leadTime: 18, grade: "Tier-A" },
  { sku: "ELEC-HD-003", name: "Active Noise-Cancelling B2B Headset", category: "Electronics", unit: "Unit", baseCost: 1800, minPrice: 2050, targetPrice: 2600, stock: 200, leadTime: 24, grade: "Enterprise" },
  { sku: "ELEC-KB-004", name: "Industrial Spill-Proof Mechanical Keyboard", category: "Electronics", unit: "Unit", baseCost: 1400, minPrice: 1600, targetPrice: 2100, stock: 180, leadTime: 36, grade: "Tier-A" },
  { sku: "ELEC-WC-005", name: "4K AI Auto-Framing Conference Webcam", category: "Electronics", unit: "Unit", baseCost: 2900, minPrice: 3250, targetPrice: 4100, stock: 90, leadTime: 24, grade: "Enterprise" },
  { sku: "ELEC-SP-006", name: "Surge Protected 12-Port Rack PDU", category: "Electronics", unit: "Unit", baseCost: 2100, minPrice: 2400, targetPrice: 3100, stock: 110, leadTime: 48, grade: "Industrial" },
  { sku: "ELEC-CB-007", name: "Braided Cat-7 High Speed Patch Cable 10m (Pack of 5)", category: "Electronics", unit: "Pack", baseCost: 650, minPrice: 750, targetPrice: 990, stock: 500, leadTime: 12, grade: "Commercial" },
  { sku: "ELEC-TB-008", name: "USB-C Dual 4K DisplayPort Docking Station", category: "Electronics", unit: "Unit", baseCost: 3800, minPrice: 4300, targetPrice: 5400, stock: 75, leadTime: 24, grade: "Enterprise" },
  { sku: "ELEC-BS-009", name: "1D/2D QR Handheld Bluetooth Barcode Scanner", category: "Electronics", unit: "Unit", baseCost: 1650, minPrice: 1900, targetPrice: 2450, stock: 160, leadTime: 24, grade: "Industrial" },
  { sku: "ELEC-MO-010", name: "Ergonomic Vertical Wireless Mouse", category: "Electronics", unit: "Unit", baseCost: 750, minPrice: 880, targetPrice: 1250, stock: 300, leadTime: 18, grade: "Tier-A" },

  // Category 2: Facility & Warehouse Automation (8 SKUs)
  { sku: "WH-TH-011", name: "Commercial Thermal Label Printer 4x6", category: "Warehouse", unit: "Unit", baseCost: 4500, minPrice: 5100, targetPrice: 6500, stock: 60, leadTime: 24, grade: "Enterprise" },
  { sku: "WH-LR-012", name: "Direct Thermal Shipping Labels (Box of 2000)", category: "Warehouse", unit: "Box", baseCost: 420, minPrice: 490, targetPrice: 720, stock: 800, leadTime: 12, grade: "Commercial" },
  { sku: "WH-SC-013", name: "Digital Heavy Duty Weighing Platform 150kg", category: "Warehouse", unit: "Unit", baseCost: 2800, minPrice: 3200, targetPrice: 4100, stock: 85, leadTime: 36, grade: "Industrial" },
  { sku: "WH-TP-014", name: "Heavy Duty 3-Inch Packaging Tape (Pack of 12)", category: "Warehouse", unit: "Pack", baseCost: 380, minPrice: 440, targetPrice: 650, stock: 950, leadTime: 12, grade: "Standard" },
  { sku: "WH-ST-015", name: "Industrial Pallet Stretch Film 500m Roll", category: "Warehouse", unit: "Roll", baseCost: 520, minPrice: 610, targetPrice: 850, stock: 400, leadTime: 18, grade: "Standard" },
  { sku: "WH-BX-016", name: "Heavy Corrugated 3-Ply Shipping Box (Bundle of 25)", category: "Warehouse", unit: "Bundle", baseCost: 480, minPrice: 560, targetPrice: 790, stock: 650, leadTime: 24, grade: "Standard" },
  { sku: "WH-CT-017", name: "Foldable Stainless Steel Heavy Platform Trolley 300kg", category: "Warehouse", unit: "Unit", baseCost: 3100, minPrice: 3600, targetPrice: 4800, stock: 45, leadTime: 48, grade: "Industrial" },
  { sku: "WH-BB-018", name: "Anti-Static Biodegradable Bubble Wrap Roll 100m", category: "Warehouse", unit: "Roll", baseCost: 680, minPrice: 790, targetPrice: 1100, stock: 320, leadTime: 18, grade: "Eco-Friendly" },

  // Category 3: Industrial Safety & PPE (8 SKUs)
  { sku: "SAFE-GL-019", name: "Cut-Resistant Level 5 Nitrile Work Gloves (Pack of 10)", category: "Safety", unit: "Pack", baseCost: 650, minPrice: 750, targetPrice: 1050, stock: 550, leadTime: 12, grade: "Tier-A" },
  { sku: "SAFE-HL-020", name: "Vented Industrial Safety Helmet with Ratchet", category: "Safety", unit: "Unit", baseCost: 350, minPrice: 410, targetPrice: 580, stock: 400, leadTime: 24, grade: "Industrial" },
  { sku: "SAFE-SH-021", name: "Steel Toe Puncture-Resistant Safety Shoes", category: "Safety", unit: "Pair", baseCost: 1250, minPrice: 1450, targetPrice: 1950, stock: 180, leadTime: 36, grade: "Industrial" },
  { sku: "SAFE-EY-022", name: "Anti-Fog UV Protective Safety Goggles (Pack of 5)", category: "Safety", unit: "Pack", baseCost: 290, minPrice: 340, targetPrice: 510, stock: 600, leadTime: 12, grade: "Commercial" },
  { sku: "SAFE-VT-023", name: "High-Visibility Reflective Safety Vest ANSI Class 2 (Pack of 10)", category: "Safety", unit: "Pack", baseCost: 480, minPrice: 560, targetPrice: 820, stock: 350, leadTime: 18, grade: "Standard" },
  { sku: "SAFE-MS-024", name: "N95 Particulate Respirator with Valve (Box of 50)", category: "Safety", unit: "Box", baseCost: 620, minPrice: 720, targetPrice: 1050, stock: 420, leadTime: 12, grade: "Medical-Grade" },
  { sku: "SAFE-FA-025", name: "Comprehensive 120-Piece Workplace First Aid Station", category: "Safety", unit: "Kit", baseCost: 1150, minPrice: 1350, targetPrice: 1850, stock: 140, leadTime: 24, grade: "Compliant" },
  { sku: "SAFE-FE-026", name: "ABC Dry Chemical Fire Extinguisher 4kg", category: "Safety", unit: "Unit", baseCost: 980, minPrice: 1150, targetPrice: 1600, stock: 190, leadTime: 24, grade: "Certified" },

  // Category 4: Smart Office & Facility Essentials (8 SKUs)
  { sku: "OFF-AP-027", name: "Smart HEPA Air Purifier for 600 sq ft Office", category: "Office", unit: "Unit", baseCost: 4600, minPrice: 5200, targetPrice: 6800, stock: 55, leadTime: 24, grade: "Enterprise" },
  { sku: "OFF-SD-028", name: "Dual-Motor Electric Height Adjustable Desk Frame", category: "Office", unit: "Unit", baseCost: 9200, minPrice: 10500, targetPrice: 13800, stock: 30, leadTime: 48, grade: "Enterprise" },
  { sku: "OFF-CH-029", name: "High-Back Ergonomic Breathable Mesh Task Chair", category: "Office", unit: "Unit", baseCost: 4100, minPrice: 4700, targetPrice: 6200, stock: 65, leadTime: 36, grade: "Tier-A" },
  { sku: "OFF-SH-030", name: "Cross-Cut Commercial Heavy Duty Paper Shredder", category: "Office", unit: "Unit", baseCost: 3300, minPrice: 3800, targetPrice: 4900, stock: 40, leadTime: 24, grade: "Commercial" },
  { sku: "OFF-WB-031", name: "Magnetic Mobile Dual-Sided Glass Whiteboard 4x3ft", category: "Office", unit: "Unit", baseCost: 2600, minPrice: 3000, targetPrice: 4100, stock: 50, leadTime: 48, grade: "Standard" },
  { sku: "OFF-PS-032", name: "A4 80GSM Multipurpose Copier Paper (Carton of 5 Reams)", category: "Office", unit: "Carton", baseCost: 1050, minPrice: 1200, targetPrice: 1550, stock: 320, leadTime: 12, grade: "Commercial" },
  { sku: "OFF-TC-033", name: "Instant Hot/Cold Water Dispenser Bottled Cooler", category: "Office", unit: "Unit", baseCost: 3800, minPrice: 4400, targetPrice: 5700, stock: 40, leadTime: 36, grade: "Tier-A" },
  { sku: "OFF-SN-034", name: "Automatic Touchless Hand Sanitizer Dispenser 1L", category: "Office", unit: "Unit", baseCost: 550, minPrice: 650, targetPrice: 950, stock: 280, leadTime: 18, grade: "Commercial" },

  // Category 5: Retail POS & Inventory Devices (6 SKUs)
  { sku: "POS-TH-035", name: "80mm High-Speed USB/Ethernet Receipt Printer", category: "Retail-POS", unit: "Unit", baseCost: 2400, minPrice: 2750, targetPrice: 3600, stock: 110, leadTime: 24, grade: "Industrial" },
  { sku: "POS-DR-036", name: "Heavy Duty 5-Bill 8-Coin Electronic Cash Drawer", category: "Retail-POS", unit: "Unit", baseCost: 1900, minPrice: 2200, targetPrice: 2950, stock: 95, leadTime: 24, grade: "Commercial" },
  { sku: "POS-TR-037", name: "Thermal Paper Roll 80mm x 50m (Box of 50)", category: "Retail-POS", unit: "Box", baseCost: 680, minPrice: 790, targetPrice: 1100, stock: 500, leadTime: 12, grade: "Standard" },
  { sku: "POS-PD-038", name: "Handheld Android Smart POS Terminal with Printer", category: "Retail-POS", unit: "Unit", baseCost: 6500, minPrice: 7400, targetPrice: 9600, stock: 35, leadTime: 36, grade: "Enterprise" },
  { sku: "POS-CW-039", name: "Counterfeit Currency Detector UV & Magnetic", category: "Retail-POS", unit: "Unit", baseCost: 1450, minPrice: 1700, targetPrice: 2300, stock: 120, leadTime: 18, grade: "Tier-A" },
  { sku: "POS-CL-040", name: "Omnidirectional Desktop Hands-Free Barcode Reader", category: "Retail-POS", unit: "Unit", baseCost: 3200, minPrice: 3700, targetPrice: 4800, stock: 70, leadTime: 24, grade: "Industrial" },
];

// Normalize properties to support both schema conventions
export const CATALOG_SKUS = RAW_SKUS.map((item) => ({
  ...item,
  baseCostPrice: item.baseCost,
  minSellingPrice: item.minPrice,
  targetSellingPrice: item.targetPrice,
}));

export function getProductBySku(sku) {
  return CATALOG_SKUS.find((p) => p.sku === sku) || null;
}

export function getDemoProduct() {
  return CATALOG_SKUS[0]; // ELEC-RT-001 (Enterprise Wi-Fi 6 Mesh Router)
}

export function getAllProducts() {
  return [...CATALOG_SKUS];
}
