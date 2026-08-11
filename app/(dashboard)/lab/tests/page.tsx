import { requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TestsClient } from "./TestsClient";

export default async function LabTestsPage() {
  const session = await requireOwner();
  const admin = createSupabaseAdminClient();

  const [{ data: tests }, { data: packages }] = await Promise.all([
    admin.from("lab_tests").select("id, name, category, sample_type, price, gst_percent, turnaround_hours, reference_range, unit, is_active").eq("shop_id", session.shopId).order("name"),
    admin.from("lab_packages").select("id, name, price, is_active, lab_package_tests ( test_id, lab_tests ( name ) )").eq("shop_id", session.shopId).order("name"),
  ]);

  return (
    <TestsClient
      tests={(tests ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        sampleType: t.sample_type,
        price: Number(t.price),
        gstPercent: Number(t.gst_percent),
        turnaroundHours: t.turnaround_hours,
        referenceRange: t.reference_range,
        unit: t.unit,
        isActive: t.is_active,
      }))}
      packages={(packages ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        isActive: p.is_active,
        testNames: (Array.isArray(p.lab_package_tests) ? p.lab_package_tests : [])
          .map((pt) => (Array.isArray(pt.lab_tests) ? pt.lab_tests[0]?.name : (pt.lab_tests as { name: string } | null)?.name))
          .filter((n): n is string => !!n),
      }))}
    />
  );
}
