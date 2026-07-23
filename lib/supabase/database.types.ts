export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      shops: {
        Row: {
          id: string;
          name: string;
          legal_name: string | null;
          gstin: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          state_code: string | null;
          pincode: string | null;
          gst_scheme: "regular" | "composition";
          invoice_prefix: string;
          logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          legal_name?: string | null;
          gstin?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          state_code?: string | null;
          pincode?: string | null;
          gst_scheme?: "regular" | "composition";
          invoice_prefix?: string;
          logo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          legal_name?: string | null;
          gstin?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          state_code?: string | null;
          pincode?: string | null;
          gst_scheme?: "regular" | "composition";
          invoice_prefix?: string;
          logo_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          role: "owner" | "staff";
          created_at: string;
        };
        Insert: {
          id: string;
          shop_id: string;
          name: string;
          role: "owner" | "staff";
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          role?: "owner" | "staff";
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "staff_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      categories: {
        Row: { id: string; shop_id: string; name: string; created_at: string };
        Insert: { id?: string; shop_id: string; name: string; created_at?: string };
        Update: { id?: string; shop_id?: string; name?: string; created_at?: string };
        Relationships: [
          { foreignKeyName: "categories_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      products: {
        Row: {
          id: string;
          shop_id: string;
          category_id: string | null;
          name: string;
          hsn_code: string | null;
          unit: string;
          price: number;
          gst_percent: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          category_id?: string | null;
          name: string;
          hsn_code?: string | null;
          unit?: string;
          price?: number;
          gst_percent?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          category_id?: string | null;
          name?: string;
          hsn_code?: string | null;
          unit?: string;
          price?: number;
          gst_percent?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "products_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "products_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
        ];
      };
      customers: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          phone: string;
          gstin: string | null;
          address: string | null;
          state: string | null;
          state_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          name: string;
          phone: string;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          phone?: string;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "customers_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      invoice_counters: {
        Row: { shop_id: string; financial_year: string; next_number: number };
        Insert: { shop_id: string; financial_year: string; next_number?: number };
        Update: { shop_id?: string; financial_year?: string; next_number?: number };
        Relationships: [];
      };
      bills: {
        Row: {
          id: string;
          shop_id: string;
          customer_id: string | null;
          staff_id: string;
          invoice_number: string;
          financial_year: string;
          subtotal: number;
          discount_type: "percent" | "flat";
          discount_value: number;
          discount_amount: number;
          taxable_amount: number;
          supply_type: "intra" | "inter";
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          gst_amount: number;
          payment_method: "cash" | "card" | "upi" | "online" | "other";
          total: number;
          paid_amount: number;
          credit_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          customer_id?: string | null;
          staff_id: string;
          invoice_number: string;
          financial_year: string;
          subtotal?: number;
          discount_type?: "percent" | "flat";
          discount_value?: number;
          discount_amount?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          customer_id?: string | null;
          staff_id?: string;
          invoice_number?: string;
          financial_year?: string;
          subtotal?: number;
          discount_type?: "percent" | "flat";
          discount_value?: number;
          discount_amount?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          payment_method?: "cash" | "card" | "upi" | "online" | "other";
          total?: number;
          paid_amount?: number;
          credit_amount?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "bills_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "bills_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "bills_staff_id_fkey"; columns: ["staff_id"]; isOneToOne: false; referencedRelation: "staff"; referencedColumns: ["id"] },
        ];
      };
      bill_items: {
        Row: {
          id: string;
          bill_id: string;
          product_id: string | null;
          product_name: string;
          hsn_code: string | null;
          quantity: number;
          unit_price: number;
          gst_percent: number;
          line_subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          line_gst: number;
          line_total: number;
        };
        Insert: {
          id?: string;
          bill_id: string;
          product_id?: string | null;
          product_name: string;
          hsn_code?: string | null;
          quantity: number;
          unit_price: number;
          gst_percent?: number;
          line_subtotal: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total: number;
        };
        Update: {
          id?: string;
          bill_id?: string;
          product_id?: string | null;
          product_name?: string;
          hsn_code?: string | null;
          quantity?: number;
          unit_price?: number;
          gst_percent?: number;
          line_subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total?: number;
        };
        Relationships: [
          { foreignKeyName: "bill_items_bill_id_fkey"; columns: ["bill_id"]; isOneToOne: false; referencedRelation: "bills"; referencedColumns: ["id"] },
          { foreignKeyName: "bill_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      payments: {
        Row: { id: string; shop_id: string; customer_id: string; staff_id: string; amount: number; note: string | null; created_at: string };
        Insert: { id?: string; shop_id: string; customer_id: string; staff_id: string; amount: number; note?: string | null; created_at?: string };
        Update: { id?: string; shop_id?: string; customer_id?: string; staff_id?: string; amount?: number; note?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "payments_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "payments_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
        ];
      };
      vendors: {
        Row: {
          id: string;
          shop_id: string;
          name: string;
          phone: string | null;
          gstin: string | null;
          address: string | null;
          state: string | null;
          state_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          name: string;
          phone?: string | null;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          name?: string;
          phone?: string | null;
          gstin?: string | null;
          address?: string | null;
          state?: string | null;
          state_code?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "vendors_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
        ];
      };
      purchases: {
        Row: {
          id: string;
          shop_id: string;
          vendor_id: string;
          staff_id: string;
          vendor_invoice_number: string;
          purchase_date: string;
          subtotal: number;
          taxable_amount: number;
          supply_type: "intra" | "inter";
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          gst_amount: number;
          total: number;
          paid_amount: number;
          payable_amount: number;
          itc_eligible: boolean;
          reverse_charge: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          shop_id: string;
          vendor_id: string;
          staff_id: string;
          vendor_invoice_number: string;
          purchase_date?: string;
          subtotal?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          total?: number;
          paid_amount?: number;
          payable_amount?: number;
          itc_eligible?: boolean;
          reverse_charge?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          shop_id?: string;
          vendor_id?: string;
          staff_id?: string;
          vendor_invoice_number?: string;
          purchase_date?: string;
          subtotal?: number;
          taxable_amount?: number;
          supply_type?: "intra" | "inter";
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          gst_amount?: number;
          total?: number;
          paid_amount?: number;
          payable_amount?: number;
          itc_eligible?: boolean;
          reverse_charge?: boolean;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: "purchases_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "purchases_vendor_id_fkey"; columns: ["vendor_id"]; isOneToOne: false; referencedRelation: "vendors"; referencedColumns: ["id"] },
        ];
      };
      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          product_id: string | null;
          description: string;
          hsn_code: string | null;
          quantity: number;
          unit_price: number;
          gst_percent: number;
          line_subtotal: number;
          cgst_amount: number;
          sgst_amount: number;
          igst_amount: number;
          line_gst: number;
          line_total: number;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          product_id?: string | null;
          description: string;
          hsn_code?: string | null;
          quantity: number;
          unit_price: number;
          gst_percent?: number;
          line_subtotal: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total: number;
        };
        Update: {
          id?: string;
          purchase_id?: string;
          product_id?: string | null;
          description?: string;
          hsn_code?: string | null;
          quantity?: number;
          unit_price?: number;
          gst_percent?: number;
          line_subtotal?: number;
          cgst_amount?: number;
          sgst_amount?: number;
          igst_amount?: number;
          line_gst?: number;
          line_total?: number;
        };
        Relationships: [
          { foreignKeyName: "purchase_items_purchase_id_fkey"; columns: ["purchase_id"]; isOneToOne: false; referencedRelation: "purchases"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ];
      };
      purchase_payments: {
        Row: { id: string; shop_id: string; vendor_id: string; staff_id: string; amount: number; note: string | null; created_at: string };
        Insert: { id?: string; shop_id: string; vendor_id: string; staff_id: string; amount: number; note?: string | null; created_at?: string };
        Update: { id?: string; shop_id?: string; vendor_id?: string; staff_id?: string; amount?: number; note?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "purchase_payments_shop_id_fkey"; columns: ["shop_id"]; isOneToOne: false; referencedRelation: "shops"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_payments_vendor_id_fkey"; columns: ["vendor_id"]; isOneToOne: false; referencedRelation: "vendors"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      next_invoice_number: {
        Args: { p_shop_id: string; p_financial_year: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
