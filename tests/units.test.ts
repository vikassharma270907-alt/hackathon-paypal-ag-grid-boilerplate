import { describe, it, expect } from 'vitest';
import {
  parsePackDescription,
  computeBaseUnitPrice,
  compareOfferUnitEconomics,
} from '../src/lib/units';
import {
  signDocketReceipt,
  verifyDocketReceipt,
} from '../src/lib/receipt-verifier';

describe('RestockPilot Unit-Price Normalizer (lib/units.ts)', () => {
  describe('1. Pack Size & Quantity Parser Across 15+ Title Patterns', () => {
    it('Pattern 1: Multiplier with volume (12 x 355 ml)', () => {
      const parsed = parsePackDescription('Oatly Barista Edition 12 x 355 ml Cartons');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(12);
      expect(parsed?.unitSize).toBe(355);
      expect(parsed?.totalBaseUnits).toBe(4260);
      expect(parsed?.unit).toBe('ml');
    });

    it('Pattern 2: Multiplier with fluid ounces (6 x 32 fl oz)', () => {
      const parsed = parsePackDescription('Pacific Foods Barista Oat Milk, 6 x 32 fl oz');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(6);
      expect(parsed?.unitSize).toBe(32);
      expect(parsed?.totalBaseUnits).toBe(192);
      expect(parsed?.unit).toBe('oz');
    });

    it('Pattern 3: Pack of N count (pack of 50)', () => {
      const parsed = parsePackDescription('Heavy Duty Portafilter Cleaning Brushes (Pack of 50)');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(50);
      expect(parsed?.totalBaseUnits).toBe(50);
      expect(parsed?.unit).toBe('count');
    });

    it('Pattern 4: Case of N (Case of 12)', () => {
      const parsed = parsePackDescription('Torani Vanilla Syrup 750ml, Case of 12');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(12);
      expect(parsed?.unit).toBe('count');
    });

    it('Pattern 5: N-pack hyphenated (6-pack)', () => {
      const parsed = parsePackDescription('Oatly Barista 6-pack Wholesale');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(6);
      expect(parsed?.unit).toBe('count');
    });

    it('Pattern 6: Explicit ct notation (100 ct)', () => {
      const parsed = parsePackDescription('Eco-Friendly Compostable Hot Cup Lids 100 ct');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(100);
      expect(parsed?.unit).toBe('count');
    });

    it('Pattern 7: Explicit count notation (500 count)', () => {
      const parsed = parsePackDescription('Kraft 12oz Double-Wall Paper Hot Cups 500 count');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(500);
      expect(parsed?.unit).toBe('count');
    });

    it('Pattern 8: Pieces abbreviation (250 pcs)', () => {
      const parsed = parsePackDescription('Unbleached Chemex Coffee Filter Squares 250 pcs');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(250);
      expect(parsed?.unit).toBe('count');
    });

    it('Pattern 9: Multi-pound weight (5 lb bag)', () => {
      const parsed = parsePackDescription('Intelligentsia Black Cat Espresso Whole Bean 5 lb bag');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(1);
      expect(parsed?.totalBaseUnits).toBe(5);
      expect(parsed?.unit).toBe('lb');
      expect(parsed?.normalizedUnit).toBe('weight_lb');
    });

    it('Pattern 10: Metric kilogram conversion (1 kg)', () => {
      const parsed = parsePackDescription('Lavazza Super Crema Espresso Beans 1 kg');
      expect(parsed).not.toBeNull();
      expect(parsed?.totalBaseUnits).toBe(1000);
      expect(parsed?.unit).toBe('g');
      expect(parsed?.normalizedUnit).toBe('weight_g');
    });

    it('Pattern 11: Metric grams (500 g)', () => {
      const parsed = parsePackDescription('Urnex Cafiza Commercial Espresso Machine Cleaner 500 g');
      expect(parsed).not.toBeNull();
      expect(parsed?.totalBaseUnits).toBe(500);
      expect(parsed?.unit).toBe('g');
    });

    it('Pattern 12: Gallon volume conversion (1 Gallon)', () => {
      const parsed = parsePackDescription('Biokleen All-Purpose Barista Surface Sanitizer 1 Gallon');
      expect(parsed).not.toBeNull();
      expect(parsed?.totalBaseUnits).toBe(128);
      expect(parsed?.unit).toBe('oz');
    });

    it('Pattern 13: Liters volume conversion (1 Liter)', () => {
      const parsed = parsePackDescription('Monin Caramel Flavoring Syrup 1 Liter Bottle');
      expect(parsed).not.toBeNull();
      expect(parsed?.totalBaseUnits).toBe(1000);
      expect(parsed?.unit).toBe('ml');
    });

    it('Pattern 14: Sleeves notation (4 sleeves)', () => {
      const parsed = parsePackDescription('Disposable Coffee Cup Sleeves 4 sleeves');
      expect(parsed).not.toBeNull();
      expect(parsed?.count).toBe(4);
      expect(parsed?.unit).toBe('count');
    });

    it('Pattern 15: Decimal pounds (2.5 lbs)', () => {
      const parsed = parsePackDescription('Decaf Colombia Supremo 2.5 lbs');
      expect(parsed).not.toBeNull();
      expect(parsed?.totalBaseUnits).toBe(2.5);
      expect(parsed?.unit).toBe('lb');
    });

    it('Pattern 16: Unparseable vague title returns null (safe failure)', () => {
      const parsed = parsePackDescription('Specialty Gourmet Coffee Beans');
      expect(parsed).toBeNull();
    });

    it('Pattern 17: Empty string or non-string returns null', () => {
      expect(parsePackDescription('')).toBeNull();
      expect(parsePackDescription(null as unknown as string)).toBeNull();
    });
  });

  describe('2. True Cost Per Unit Calculation', () => {
    it('computes unit price per cup on a 500-count carton', () => {
      const res = computeBaseUnitPrice(35.00, 'Kraft 12oz Paper Cups 500 count');
      expect(res.parsed).toBe(true);
      expect(res.pricePerBaseUnit).toBe(0.07);
      expect(res.formattedUnitPrice).toBe('$0.07 / count');
    });

    it('computes unit price per pound on 5lb espresso bag', () => {
      const res = computeBaseUnitPrice(62.00, 'Artisan Espresso Beans 5 lb bag');
      expect(res.parsed).toBe(true);
      expect(res.pricePerBaseUnit).toBe(12.40);
      expect(res.formattedUnitPrice).toBe('$12.40 / lb');
    });

    it('fails safely with hold reason when pack size cannot be extracted', () => {
      const res = computeBaseUnitPrice(25.00, 'Random Generic Accessories');
      expect(res.parsed).toBe(false);
      expect(res.errorReason).toContain('hold: cannot compare unit price');
    });
  });

  describe('3. Unit Economics Comparison (Avoiding Sticker Price Deception)', () => {
    it('detects that a 50-cup pack ($5.00) is more expensive per unit than a 100-cup sleeve ($7.00)', () => {
      const offerSmall = { title: 'Disposable Hot Cups Pack of 50', totalPrice: 5.00 }; // $0.10/cup
      const offerLarge = { title: 'Disposable Hot Cups 100 ct', totalPrice: 7.00 };      // $0.07/cup

      const comp = compareOfferUnitEconomics(offerSmall, offerLarge);
      expect(comp.comparable).toBe(true);
      expect(comp.cheaperOffer).toBe('B'); // 100 ct is cheaper per cup
      expect(comp.unitPriceA).toBe(0.10);
      expect(comp.unitPriceB).toBe(0.07);
      expect(comp.savingsPct).toBe(30);
      expect(comp.explanation).toContain('30% lower cost per unit');
    });

    it('rejects comparison across incompatible dimensions (cups vs weight)', () => {
      const offerCups = { title: 'Paper Cups 100 ct', totalPrice: 10.00 };
      const offerBeans = { title: 'Espresso Beans 5 lb', totalPrice: 60.00 };

      const comp = compareOfferUnitEconomics(offerCups, offerBeans);
      expect(comp.comparable).toBe(false);
      expect(comp.explanation).toContain('Incompatible unit dimensions');
    });
  });

  describe('4. Cryptographic Docket Receipt Signing & Verification (receipt-verifier.ts)', () => {
    it('generates a tamper-evident signed receipt with HMAC-SHA256', () => {
      const receipt = signDocketReceipt({
        poId: 'PO-2026-ESP-01',
        sku: 'ESPRESSO-5LB',
        orderTotal: 868.00,
        approvedQty: 14,
        unitPrice: 62.00,
        verifiedMedianPrice: 63.25,
        status: 'CAPTURED',
        checksSummary: ['Budget: PASS', 'Condition: PASS', 'Peer Median: PASS'],
        contractHash: 'a1b2c3d4e5f6',
        paypalOrderId: 'ORD-SANDBOX-101',
        paypalCaptureId: 'CAP-SANDBOX-202',
      });

      expect(receipt.signature).toBeDefined();
      expect(receipt.signature.length).toBe(64); // SHA-256 hex string
      expect(receipt.verifiedWithPayPal).toBe(true);

      const verification = verifyDocketReceipt(receipt);
      expect(verification.valid).toBe(true);
    });

    it('detects tampering when order total or quantities are altered', () => {
      const receipt = signDocketReceipt({
        poId: 'PO-2026-ESP-01',
        sku: 'ESPRESSO-5LB',
        orderTotal: 868.00,
        approvedQty: 14,
        unitPrice: 62.00,
        verifiedMedianPrice: 63.25,
        status: 'CAPTURED',
        checksSummary: ['Budget: PASS'],
        contractHash: 'a1b2c3d4e5f6',
      });

      // Tamper with order total from 868 to 1200
      const tampered = { ...receipt, orderTotal: 1200.00 };
      const check = verifyDocketReceipt(tampered);
      expect(check.valid).toBe(false);
      expect(check.reason).toContain('Signature mismatch');
    });
  });
});
