/**
 * A starter list of common generic medicine names used in Indian
 * pharmacies, to speed up typing when adding a new item.
 *
 * IMPORTANT: this is NOT an authoritative or exhaustive medicine
 * database — it's a few hundred well-known generic names across common
 * therapeutic categories, meant purely to reduce typing for frequently
 * stocked items. It has no dosage, brand, or interaction data, and
 * omission from this list says nothing about a medicine's availability
 * or legitimacy. Always verify strength/formulation against the actual
 * pack before billing.
 */
export const COMMON_MEDICINE_NAMES: string[] = [
  // Pain & fever
  "Paracetamol", "Ibuprofen", "Aspirin", "Diclofenac", "Aceclofenac", "Naproxen",
  "Mefenamic Acid", "Nimesulide", "Tramadol", "Etoricoxib", "Ketorolac",

  // Antibiotics
  "Amoxicillin", "Amoxicillin + Clavulanic Acid", "Azithromycin", "Ciprofloxacin",
  "Ofloxacin", "Levofloxacin", "Cefixime", "Cefpodoxime", "Cefadroxil", "Cefuroxime",
  "Doxycycline", "Metronidazole", "Clarithromycin", "Erythromycin", "Ampicillin",
  "Cloxacillin", "Norfloxacin", "Co-trimoxazole", "Clindamycin", "Linezolid",

  // Antacids / GI
  "Omeprazole", "Pantoprazole", "Rabeprazole", "Esomeprazole", "Ranitidine",
  "Domperidone", "Ondansetron", "Loperamide", "ORS (Oral Rehydration Salts)",
  "Lactulose", "Sucralfate", "Dicyclomine", "Drotaverine", "Simethicone",

  // Diabetes
  "Metformin", "Glimepiride", "Glipizide", "Gliclazide", "Sitagliptin",
  "Voglibose", "Pioglitazone", "Insulin (Human)", "Teneligliptin",

  // Blood pressure / heart
  "Amlodipine", "Atenolol", "Losartan", "Telmisartan", "Enalapril", "Ramipril",
  "Metoprolol", "Atorvastatin", "Rosuvastatin", "Clopidogrel", "Nitroglycerin",
  "Furosemide", "Hydrochlorothiazide", "Spironolactone", "Digoxin",

  // Allergy / antihistamine
  "Cetirizine", "Levocetirizine", "Fexofenadine", "Chlorpheniramine",
  "Montelukast", "Loratadine", "Hydroxyzine",

  // Cough / cold / respiratory
  "Dextromethorphan", "Ambroxol", "Bromhexine", "Salbutamol", "Guaifenesin",
  "Budesonide", "Theophylline", "Levosalbutamol", "Terbutaline",

  // Vitamins & supplements
  "Vitamin B Complex", "Vitamin C", "Vitamin D3", "Vitamin B12 (Methylcobalamin)",
  "Calcium Carbonate", "Folic Acid", "Ferrous Sulphate (Iron)", "Zinc Sulphate",
  "Multivitamin", "Calcium + Vitamin D3", "Omega-3 Fatty Acids",

  // Skin / topical
  "Clotrimazole", "Betamethasone", "Mupirocin", "Fusidic Acid", "Permethrin",
  "Calamine Lotion", "Neomycin", "Silver Sulfadiazine", "Terbinafine (topical)",
  "Diclofenac Gel", "Methyl Salicylate",

  // Steroids
  "Prednisolone", "Dexamethasone", "Hydrocortisone", "Methylprednisolone",

  // Anti-worm
  "Albendazole", "Mebendazole",

  // Anti-fungal (oral)
  "Fluconazole", "Itraconazole", "Ketoconazole", "Terbinafine",

  // Thyroid
  "Levothyroxine",

  // Sedative / anxiety (Schedule H1 — track prescription)
  "Alprazolam", "Diazepam", "Clonazepam", "Lorazepam", "Zolpidem",

  // Muscle relaxant
  "Chlorzoxazone", "Tizanidine", "Baclofen",

  // Eye / ear drops
  "Chloramphenicol (eye drops)", "Ciprofloxacin (eye drops)", "Sodium Chloride (eye drops)",

  // Women's health
  "Iron + Folic Acid", "Mifepristone", "Misoprostol", "Clomiphene",

  // Others / general OTC
  "Activated Charcoal", "Glycerin Suppository", "Povidone Iodine",
  "Hydrogen Peroxide", "ORS + Zinc", "Rabies Immunoglobulin",

  // Anti-hypertensive (additional)
  "Losartan + Hydrochlorothiazide", "Amlodipine + Atenolol", "Bisoprolol",
  "Carvedilol", "Prazosin", "Clonidine", "Methyldopa", "Nebivolol",

  // Diabetes (additional)
  "Vildagliptin", "Empagliflozin", "Dapagliflozin", "Linagliptin",
  "Metformin + Glimepiride", "Insulin Glargine", "Insulin Aspart",

  // Antibiotics (additional)
  "Amikacin", "Gentamicin", "Doxycycline Hyclate", "Tinidazole",
  "Nitrofurantoin", "Rifaximin", "Piperacillin + Tazobactam", "Meropenem",

  // Cardiac / heart failure
  "Ivabradine", "Sacubitril + Valsartan", "Isosorbide Dinitrate",
  "Ranolazine", "Trimetazidine",

  // Respiratory (additional)
  "Formoterol", "Tiotropium", "Fluticasone", "Montelukast + Levocetirizine",
  "Acetylcysteine", "Ipratropium Bromide",

  // GI (additional)
  "Domperidone + Rabeprazole", "Mesalamine", "Ursodeoxycholic Acid",
  "Rifaximin (IBS)", "Prucalopride", "Bisacodyl", "Ispaghula Husk",

  // Pain / neuropathic
  "Pregabalin", "Gabapentin", "Duloxetine", "Amitriptyline",
  "Diclofenac + Paracetamol", "Thiocolchicoside",

  // Skin (additional)
  "Adapalene", "Benzoyl Peroxide", "Tretinoin", "Salicylic Acid",
  "Ketoconazole (shampoo)", "Coal Tar", "Tacrolimus (topical)",

  // Ophthalmology (additional)
  "Timolol (eye drops)", "Latanoprost (eye drops)", "Carboxymethylcellulose (eye drops)",
  "Moxifloxacin (eye drops)", "Ketotifen (eye drops)",

  // Women's health / hormones (additional)
  "Progesterone", "Estradiol", "Ethinylestradiol + Levonorgestrel",
  "Dydrogesterone", "Letrozole",

  // Pediatric-common
  "Paracetamol (syrup)", "Amoxicillin (syrup)", "ORS (pediatric)",
  "Zinc Sulphate (syrup)", "Cetirizine (syrup)", "Multivitamin (drops)",

  // Anti-viral
  "Acyclovir", "Oseltamivir", "Valacyclovir",

  // Immunosuppressant / autoimmune
  "Hydroxychloroquine", "Methotrexate", "Sulfasalazine", "Azathioprine",

  // Anesthesia / pre-op (common OTC-adjacent)
  "Lidocaine (topical)", "Ondansetron (injection)",
];
