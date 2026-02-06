/**
 * Imperium Maledictum Item Importer v2.0.0
 * Rewritten using Foundry V12+ ApplicationV2 API
 * Supports: Weapons, Armour, Shields, Force Fields
 */

const MODULE_ID = "impmal-item-importer";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/* -------------------------------------------- */
/* Main Importer Application                    */
/* -------------------------------------------- */

class IMItemImporterApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "impmal-item-importer",
    tag: "form",
    classes: ["impmal-item-importer"],
    window: {
      title: "IM Item Importer",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      width: 700,
      height: 650
    },
    form: {
      handler: IMItemImporterApp.onSubmit,
      submitOnChange: false,
      closeOnSubmit: false
    },
    actions: {
      formatPaste: IMItemImporterApp.onFormatPaste,
      preview: IMItemImporterApp.onPreview,
      import: IMItemImporterApp.onImport,
      configureTraits: IMItemImporterApp.onConfigureTraits
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/importer.hbs`
    }
  };

  async _prepareContext(options) {
    const folders = game.folders.filter(f => f.type === "Item").map(f => ({
      id: f.id,
      name: f.name
    }));

    return { folders };
  }

  _onRender(context, options) {
    const html = this.element;

    // Show/hide weapon category based on item type
    const itemTypeSelect = html.querySelector("select[name='itemType']");
    const weaponCategoryGroup = html.querySelector(".weapon-category-group");
    
    const updateCategoryVisibility = () => {
      const val = itemTypeSelect.value;
      weaponCategoryGroup.style.display = val === "weapon" ? "" : "none";
    };
    
    itemTypeSelect?.addEventListener("change", updateCategoryVisibility);
    updateCategoryVisibility();
  }

  // Static action handlers
  static async onFormatPaste(event, target) {
    const textarea = this.element.querySelector("textarea[name='rawInput']");
    if (!textarea) return;
    
    const text = textarea.value;
    const formatted = formatPastedText(text);
    textarea.value = formatted;
    ui.notifications.info("Formatted text with pipe delimiters.");
  }

  static async onPreview(event, target) {
    const formData = new FormDataExtended(this.element);
    const data = formData.object;
    
    const itemType = data.itemType;
    const weaponCategory = data.weaponCategory;
    const rawInput = data.rawInput?.trim();

    if (!rawInput) {
      ui.notifications.warn("Please enter item data to preview.");
      return;
    }

    const customTraitDefs = getCustomTraitDefinitions();
    const lines = rawInput.split("\n").filter(l => l.trim());
    const previews = [];

    for (const line of lines) {
      const parsed = parseLine(line, itemType, weaponCategory, customTraitDefs);
      if (parsed) {
        previews.push(`✓ ${parsed.name} (${parsed.type})`);
      } else {
        previews.push(`✗ Could not parse: ${line.substring(0, 50)}...`);
      }
    }

    const content = `<pre style="max-height:300px;overflow:auto;white-space:pre-wrap;">${previews.join("\n")}</pre>`;
    new Dialog({
      title: "Preview",
      content,
      buttons: { ok: { label: "OK" } }
    }).render(true);
  }

  static async onImport(event, target) {
    const formData = new FormDataExtended(this.element);
    const data = formData.object;

    const itemType = data.itemType;
    const weaponCategory = data.weaponCategory;
    const folderId = data.folder || null;
    const rawInput = data.rawInput?.trim();

    if (!rawInput) {
      ui.notifications.warn("Please enter item data to import.");
      return;
    }

    const customTraitDefs = getCustomTraitDefinitions();
    const lines = rawInput.split("\n").filter(l => l.trim());
    const parsed = [];

    for (const line of lines) {
      const item = parseLine(line, itemType, weaponCategory, customTraitDefs);
      if (item) parsed.push(item);
    }

    if (!parsed.length) {
      ui.notifications.warn("No valid items could be parsed.");
      return;
    }

    const created = [];
    for (const itemData of parsed) {
      try {
        if (folderId) itemData.folder = folderId;
        const item = await Item.create(itemData);
        created.push(item);
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to create:`, itemData.name, err);
        ui.notifications.error(`Failed to create "${itemData.name}": ${err.message}`);
      }
    }

    if (created.length) {
      ui.notifications.info(`Successfully imported ${created.length} item(s).`);
    }
  }

  static async onConfigureTraits(event, target) {
    openCustomTraitsConfig();
  }

  static async onSubmit(event, form, formData) {
    // Form submission handled by action buttons
  }
}

/* -------------------------------------------- */
/* Custom Traits Configuration                  */
/* -------------------------------------------- */

function openCustomTraitsConfig() {
  const traitsJson = game.settings.get(MODULE_ID, "customTraits") || "[]";
  let traits = [];
  try {
    traits = JSON.parse(traitsJson);
  } catch (e) {
    traits = [];
  }
  showTraitsDialog(traits);
}

function showTraitsDialog(traits) {
  let rows = "";
  if (traits.length === 0) {
    rows = `<div class="no-traits">No custom traits defined. Click "Add Trait" to create one.</div>`;
  } else {
    traits.forEach((trait, index) => {
      rows += `
        <div class="trait-row" data-index="${index}">
          <input type="text" class="trait-name" value="${(trait.name || "").replace(/"/g, "&quot;")}" placeholder="Trait Name" />
          <textarea class="trait-desc" placeholder="Description...">${trait.description || ""}</textarea>
          <button type="button" class="delete-trait" data-index="${index}" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      `;
    });
  }
  
  const content = `
    <style>
      .impmal-traits-config .trait-row {
        display: grid;
        grid-template-columns: 180px 1fr 32px;
        gap: 0.5rem;
        align-items: start;
        padding: 0.5rem;
        margin-bottom: 0.5rem;
        background: rgba(0,0,0,0.1);
        border-radius: 4px;
      }
      .impmal-traits-config .trait-row input { height: 28px; }
      .impmal-traits-config .trait-row textarea { min-height: 60px; resize: vertical; }
      .impmal-traits-config .trait-row button { width: 28px; height: 28px; padding: 0; }
      .impmal-traits-config .no-traits { text-align: center; color: #666; padding: 2rem; font-style: italic; }
      .impmal-traits-config .traits-list { max-height: 350px; overflow-y: auto; margin-bottom: 0.5rem; }
      .impmal-traits-config .add-btn { margin-bottom: 0.5rem; }
    </style>
    <div class="impmal-traits-config">
      <p class="hint">Define traits not in the Imperium Maledictum system. These will be added to item Notes when imported.</p>
      <button type="button" class="add-btn"><i class="fas fa-plus"></i> Add Trait</button>
      <div class="traits-list">${rows}</div>
    </div>
  `;

  const collectTraits = (jqHtml) => {
    const collected = [];
    jqHtml.find(".trait-row").each((i, row) => {
      const $row = $(row);
      collected.push({
        name: $row.find(".trait-name").val() || "",
        description: $row.find(".trait-desc").val() || ""
      });
    });
    return collected;
  };

  new Dialog({
    title: "Custom Traits Configuration",
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Save",
        callback: (html) => {
          const finalTraits = collectTraits(html).filter(t => t.name?.trim() && t.description?.trim());
          game.settings.set(MODULE_ID, "customTraits", JSON.stringify(finalTraits));
          ui.notifications.info(`Saved ${finalTraits.length} custom trait(s).`);
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel"
      }
    },
    default: "save",
    render: (html) => {
      html.find(".add-btn").on("click", () => {
        const current = collectTraits(html);
        current.push({ name: "", description: "" });
        html.closest(".app").find(".header-button.close").trigger("click");
        setTimeout(() => showTraitsDialog(current), 100);
      });

      html.find(".delete-trait").on("click", (ev) => {
        const index = parseInt(ev.currentTarget.dataset.index);
        const current = collectTraits(html);
        current.splice(index, 1);
        html.closest(".app").find(".header-button.close").trigger("click");
        setTimeout(() => showTraitsDialog(current), 100);
      });
    }
  }, {
    width: 600,
    height: "auto",
    resizable: true
  }).render(true);
}

// Wrapper class for settings menu
class CustomTraitsConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "impmal-custom-traits-config-wrapper"
    });
  }
  
  async render(force) {
    openCustomTraitsConfig();
    return this;
  }
}

/* -------------------------------------------- */
/* Initialization                               */
/* -------------------------------------------- */

Hooks.once("init", async () => {
  console.log(`${MODULE_ID} | Initializing`);
  await loadTemplates([
    `modules/${MODULE_ID}/templates/importer.hbs`
  ]);
  
  // Register settings
  game.settings.register(MODULE_ID, "customTraits", {
    name: "Custom Traits",
    hint: "Custom trait definitions",
    scope: "world",
    config: false,
    type: String,
    default: "[]"
  });

  game.settings.registerMenu(MODULE_ID, "customTraitsMenu", {
    name: "Custom Traits",
    label: "Configure Custom Traits",
    hint: "Define custom traits for non-system traits",
    icon: "fas fa-list",
    type: CustomTraitsConfig,
    restricted: true
  });

  // Icon settings
  game.settings.register(MODULE_ID, "meleeIcon", {
    name: "Default Melee Weapon Icon",
    hint: "Default icon for melee weapons",
    scope: "world",
    config: true,
    type: String,
    default: "modules/impmal-core/assets/icons/weapons/melee-weapon.webp",
    filePicker: "image"
  });

  game.settings.register(MODULE_ID, "rangedIcon", {
    name: "Default Ranged Weapon Icon",
    hint: "Default icon for ranged weapons",
    scope: "world",
    config: true,
    type: String,
    default: "modules/impmal-core/assets/icons/weapons/ranged-weapon.webp",
    filePicker: "image"
  });

  game.settings.register(MODULE_ID, "grenadeIcon", {
    name: "Default Grenade Icon",
    hint: "Default icon for grenades",
    scope: "world",
    config: true,
    type: String,
    default: "modules/impmal-core/assets/icons/weapons/frag-missile.webp",
    filePicker: "image"
  });

  game.settings.register(MODULE_ID, "armourIcon", {
    name: "Default Armour Icon",
    hint: "Default icon for armour",
    scope: "world",
    config: true,
    type: String,
    default: "modules/impmal-core/assets/icons/protection/armour.webp",
    filePicker: "image"
  });

  game.settings.register(MODULE_ID, "shieldIcon", {
    name: "Default Shield Icon",
    hint: "Default icon for shields",
    scope: "world",
    config: true,
    type: String,
    default: "modules/impmal-core/assets/icons/protection/shield.webp",
    filePicker: "image"
  });

  game.settings.register(MODULE_ID, "forceFieldIcon", {
    name: "Default Force Field Icon",
    hint: "Default icon for force fields",
    scope: "world",
    config: true,
    type: String,
    default: "modules/impmal-core/assets/icons/protection/field.webp",
    filePicker: "image"
  });
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);
  window.IMItemImporter = { open: () => new IMItemImporterApp().render(true) };
});

Hooks.on("renderItemDirectory", (app, html, data) => {
  // In V12+, html is a native HTMLElement, not jQuery
  const element = html instanceof jQuery ? html[0] : html;
  
  // Add import button to the bottom of the Items sidebar
  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "impmal-import-btn";
  importButton.title = "IM Item Importer";
  importButton.innerHTML = '<i class="fas fa-file-import"></i> Import Items';
  importButton.style.cssText = "margin: 0.5rem; width: calc(100% - 1rem);";
  
  // Find the footer or append to the end
  const footer = element.querySelector(".directory-footer");
  if (footer) {
    footer.prepend(importButton);
  } else {
    // Append to the end of the directory
    element.appendChild(importButton);
  }
  
  importButton.addEventListener("click", (ev) => {
    ev.preventDefault();
    new IMItemImporterApp().render(true);
  });
});

/* -------------------------------------------- */
/* Parsing Functions                            */
/* -------------------------------------------- */

function parseLine(line, itemType, weaponCategory, customTraitDefs) {
  const normalized = normalizeText(line);
  const parts = normalized.split("|").map(p => p.trim());
  
  if (parts.length < 2) return null;

  switch (itemType) {
    case "weapon":
      return parseWeapon(parts, weaponCategory, customTraitDefs);
    case "protection":
      return parseArmour(parts, customTraitDefs);
    case "shield":
      return parseShield(parts, customTraitDefs);
    case "forceField":
      return parseForceField(parts);
    default:
      return null;
  }
}

function parseWeapon(parts, category, customTraitDefs) {
  const name = parts[0];
  const spec = parts[1]?.toLowerCase() || "";

  // Detect weapon type
  const isMelee = spec.includes("one-handed") || spec.includes("two-handed") || spec.includes("brawling");
  const isGrenade = spec.includes("thrown");
  const hasRangedFormat = parts.length >= 8 && /^(Short|Medium|Long|Extreme)$/i.test(parts[3]?.trim());

  if (isMelee) {
    return parseMelee(name, parts, category, customTraitDefs);
  } else if (hasRangedFormat && isGrenade) {
    return parseGrenade(name, parts, customTraitDefs);
  } else if (hasRangedFormat) {
    return parseRanged(name, parts, category, customTraitDefs);
  } else if (isGrenade) {
    return parseGrenadeSimple(name, parts, customTraitDefs);
  } else {
    // Default to melee
    return parseMelee(name, parts, category, customTraitDefs);
  }
}

function parseMelee(name, parts, category, customTraitDefs) {
  // Format: Name | Spec | Damage | Enc | Cost | Avail | Traits
  if (parts.length < 6) return null;

  const spec = parseSpec(parts[1], "melee");
  const { base: damageBase, characteristic } = parseDamage(parts[2]);
  const enc = parseNumber(parts[3]);
  const cost = parseNumber(parts[4]);
  const avail = parseAvailability(parts[5]);
  const traitsStr = parts.slice(6).join(" ");
  const { traits, customTraitNotes } = parseTraitsWithCustom(traitsStr, customTraitDefs);

  return {
    name,
    type: "weapon",
    img: game.settings.get(MODULE_ID, "meleeIcon"),
    system: {
      attackType: "melee",
      spec,
      category: category || "mundane",
      damage: { base: damageBase, characteristic, SL: true },
      range: "",
      mag: { value: 0, current: 0 },
      encumbrance: { value: enc },
      cost,
      availability: avail,
      traits: { list: traits },
      notes: { player: customTraitNotes, gm: "" }
    },
    flags: { [MODULE_ID]: { importedAt: Date.now() } }
  };
}

function parseRanged(name, parts, category, customTraitDefs) {
  // Format: Name | Spec | Damage | Range | Mag | Enc | Cost | Avail | Traits
  if (parts.length < 8) return null;

  const spec = parseSpec(parts[1], "ranged");
  const { base: damageBase, characteristic } = parseDamage(parts[2]);
  const range = parseRange(parts[3]);
  const { magValue, magCurrent } = parseMagazine(parts[4]);
  const enc = parseNumber(parts[5]);
  const cost = parseNumber(parts[6]);
  const avail = parseAvailability(parts[7]);
  const traitsStr = parts.slice(8).join(" ");
  const { traits, customTraitNotes } = parseTraitsWithCustom(traitsStr, customTraitDefs);

  return {
    name,
    type: "weapon",
    img: game.settings.get(MODULE_ID, "rangedIcon"),
    system: {
      attackType: "ranged",
      spec,
      category: category || "mundane",
      damage: { base: damageBase, characteristic, SL: true },
      range,
      mag: { value: magValue, current: magCurrent },
      encumbrance: { value: enc },
      cost,
      availability: avail,
      traits: { list: traits },
      notes: { player: customTraitNotes, gm: "" }
    },
    flags: { [MODULE_ID]: { importedAt: Date.now() } }
  };
}

function parseGrenade(name, parts, customTraitDefs) {
  // Format: Name | Spec | Damage | Range | Mag(-) | Enc | Cost | Avail | Traits
  if (parts.length < 8) return null;

  const specStr = parts[1].toLowerCase();
  let spec = "thrown";
  if (specStr.includes("ordnance")) spec = "ordnance";
  if (specStr.includes("engineering")) spec = "engineering";

  const { base: damageBase, characteristic } = parseDamage(parts[2]);
  const thrownRange = parts[3]?.trim() || "";
  const enc = parseNumber(parts[5]);
  const cost = parseNumber(parts[6]);
  const avail = parseAvailability(parts[7]);
  const traitsStr = parts.slice(8).join(" ");
  const { traits, customTraitNotes } = parseTraitsWithCustom(traitsStr, customTraitDefs);

  // Add Thrown trait with range
  if (!traits.some(t => t.key === "thrown")) {
    traits.push({ key: "thrown", value: thrownRange });
  }

  return {
    name,
    type: "weapon",
    img: game.settings.get(MODULE_ID, "grenadeIcon"),
    system: {
      attackType: "ranged",
      spec,
      category: "explosive",
      damage: { base: damageBase, characteristic, SL: false },
      range: "",
      mag: { value: 1, current: 1 },
      encumbrance: { value: enc },
      cost,
      availability: avail,
      traits: { list: traits },
      notes: { player: customTraitNotes, gm: "" }
    },
    flags: { [MODULE_ID]: { importedAt: Date.now() } }
  };
}

function parseGrenadeSimple(name, parts, customTraitDefs) {
  // Format: Name | Spec | Damage | Enc | Cost | Avail | Traits
  if (parts.length < 6) return null;

  const { base: damageBase, characteristic } = parseDamage(parts[2]);
  const enc = parseNumber(parts[3]);
  const cost = parseNumber(parts[4]);
  const avail = parseAvailability(parts[5]);
  const traitsStr = parts.slice(6).join(" ");
  const { traits, customTraitNotes } = parseTraitsWithCustom(traitsStr, customTraitDefs);

  return {
    name,
    type: "weapon",
    img: game.settings.get(MODULE_ID, "grenadeIcon"),
    system: {
      attackType: "ranged",
      spec: "thrown",
      category: "explosive",
      damage: { base: damageBase, characteristic, SL: false },
      range: "",
      mag: { value: 1, current: 1 },
      encumbrance: { value: enc },
      cost,
      availability: avail,
      traits: { list: traits },
      notes: { player: customTraitNotes, gm: "" }
    },
    flags: { [MODULE_ID]: { importedAt: Date.now() } }
  };
}

function parseArmour(parts, customTraitDefs) {
  // Format: Name | Category | Armour | Enc | Cost | Avail | Locations | Traits
  if (parts.length < 6) return null;

  const name = parts[0];
  const category = parseArmourCategory(parts[1]);
  const armour = parseNumber(parts[2]);
  const enc = parseNumber(parts[3]);
  const cost = parseNumber(parts[4]);
  const avail = parseAvailability(parts[5]);
  const locations = parts[6] ? parseLocations(parts[6]) : { label: "All", list: ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"] };
  const traitsStr = parts.slice(7).join(" ");
  const { traits, customTraitNotes } = parseTraitsWithCustom(traitsStr, customTraitDefs);

  return {
    name,
    type: "protection",
    img: game.settings.get(MODULE_ID, "armourIcon"),
    system: {
      category,
      armour,
      encumbrance: { value: enc },
      cost,
      availability: avail,
      locations,
      traits: { list: traits },
      notes: { player: customTraitNotes, gm: "" }
    },
    flags: { [MODULE_ID]: { importedAt: Date.now() } }
  };
}

function parseShield(parts, customTraitDefs) {
  // Format: Name | Special | - | Enc | Cost | Avail | Traits
  if (parts.length < 6) return null;

  const name = parts[0];
  const enc = parseNumber(parts[3]);
  const cost = parseNumber(parts[4]);
  const avail = parseAvailability(parts[5]);
  const traitsStr = parts.slice(6).join(" ");
  const { traits, customTraitNotes } = parseTraitsWithCustom(traitsStr, customTraitDefs);

  return {
    name,
    type: "protection",
    img: game.settings.get(MODULE_ID, "shieldIcon"),
    system: {
      category: "shield",
      armour: 0,
      encumbrance: { value: enc },
      cost,
      availability: avail,
      locations: { label: "", list: [] },
      traits: { list: traits },
      notes: { player: customTraitNotes, gm: "" }
    },
    flags: { [MODULE_ID]: { importedAt: Date.now() } }
  };
}

function parseForceField(parts) {
  // Format: Name | Protection | Overload | Enc | Cost | Avail
  if (parts.length < 6) return null;

  const name = parts[0];
  const protection = parts[1]?.trim() || "0"; // Dice formula like "2d10"
  const overload = parseNumber(parts[2]);
  const enc = parseNumber(parts[3]);
  const cost = parseNumber(parts[4]);
  const avail = parseAvailability(parts[5]);

  return {
    name,
    type: "forceField",
    img: game.settings.get(MODULE_ID, "forceFieldIcon"),
    system: {
      protection,
      overload: { value: overload, collapsed: false },
      encumbrance: { value: enc },
      cost,
      availability: avail,
      traits: { list: [] },
      notes: { player: "", gm: "" }
    },
    flags: { [MODULE_ID]: { importedAt: Date.now() } }
  };
}

/* -------------------------------------------- */
/* Helper Functions                             */
/* -------------------------------------------- */

function normalizeText(t) {
  return String(t ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[""]/g, '"')
    .replace(/[']/g, "'")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function parseNumber(s) {
  if (!s) return 0;
  const cleaned = String(s).replace(/[,\s]/g, "").replace(/−/g, "-");
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

function parseAvailability(s) {
  if (!s) return "common";
  const lower = s.toLowerCase().trim();
  if (lower.includes("ubiquitous")) return "ubiquitous";
  if (lower.includes("abundant")) return "abundant";
  if (lower.includes("plentiful")) return "plentiful";
  if (lower.includes("common")) return "common";
  if (lower.includes("scarce")) return "scarce";
  if (lower.includes("rare")) return "rare";
  if (lower.includes("exotic")) return "exotic";
  return "common";
}

function parseSpec(s, type) {
  if (!s) return type === "melee" ? "oneHanded" : "pistol";
  const lower = s.toLowerCase().trim();
  
  // Melee
  if (lower.includes("one-handed") || lower.includes("one handed")) return "oneHanded";
  if (lower.includes("two-handed") || lower.includes("two handed")) return "twoHanded";
  if (lower.includes("brawling")) return "brawling";
  
  // Ranged
  if (lower.includes("pistol")) return "pistol";
  if (lower.includes("long gun") || lower.includes("longgun")) return "longGun";
  if (lower.includes("ordnance")) return "ordnance";
  if (lower.includes("engineering")) return "engineering";
  if (lower.includes("thrown")) return "thrown";
  
  return type === "melee" ? "oneHanded" : "pistol";
}

function parseDamage(s) {
  if (!s) return { base: 0, characteristic: "str" };
  
  const cleaned = s.replace(/\s+/g, "").toLowerCase();
  
  // Check for characteristic modifiers
  let characteristic = "";
  let modifier = 0;
  
  const patterns = [
    { regex: /(\d+)\+str/i, char: "str" },
    { regex: /(\d+)\+ag/i, char: "ag" },
    { regex: /(\d+)\+int/i, char: "int" },
    { regex: /(\d+)\+wil/i, char: "wil" },
    { regex: /(\d+)\+fel/i, char: "fel" },
    { regex: /(\d+)\+per/i, char: "per" },
    { regex: /(\d+)\+t/i, char: "tgh" },
    { regex: /str\+(\d+)/i, char: "str" },
    { regex: /ag\+(\d+)/i, char: "ag" }
  ];
  
  for (const { regex, char } of patterns) {
    const match = cleaned.match(regex);
    if (match) {
      modifier = parseInt(match[1], 10);
      characteristic = char;
      break;
    }
  }
  
  // Flat damage
  if (!characteristic) {
    const numMatch = cleaned.match(/^(\d+)/);
    if (numMatch) {
      return { base: parseInt(numMatch[1], 10), characteristic: "" };
    }
  }
  
  return { base: modifier, characteristic };
}

function parseRange(s) {
  if (!s) return "";
  const lower = s.toLowerCase().trim();
  if (lower.includes("short")) return "short";
  if (lower.includes("medium")) return "medium";
  if (lower.includes("long")) return "long";
  if (lower.includes("extreme")) return "extreme";
  return "";
}

function parseMagazine(s) {
  if (!s) return { magValue: 0, magCurrent: 0 };
  const cleaned = String(s).replace(/[^0-9]/g, "");
  const num = parseInt(cleaned, 10);
  if (isNaN(num) || num < 0) return { magValue: 0, magCurrent: 0 };
  return { magValue: num, magCurrent: num };
}

function parseArmourCategory(s) {
  if (!s) return "mundane";
  const lower = s.toLowerCase().trim();
  if (lower.includes("flak")) return "flak";
  if (lower.includes("mesh")) return "mesh";
  if (lower.includes("carapace")) return "carapace";
  if (lower.includes("power")) return "power";
  if (lower.includes("shield")) return "shield";
  return "mundane";
}

function parseLocations(s) {
  if (!s) return { label: "All", list: ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"] };
  
  const lower = s.toLowerCase();
  const list = [];
  
  if (lower.includes("all")) {
    return { label: "All", list: ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"] };
  }
  
  if (lower.includes("head")) list.push("head");
  if (lower.includes("body") || lower.includes("torso")) list.push("body");
  if (lower.includes("arm")) {
    list.push("leftArm", "rightArm");
  }
  if (lower.includes("leg")) {
    list.push("leftLeg", "rightLeg");
  }
  
  return { label: s, list: list.length ? list : ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"] };
}

/* -------------------------------------------- */
/* Trait Parsing                                */
/* -------------------------------------------- */

const SYSTEM_TRAIT_KEYS = new Set([
  "blast", "burst", "close", "defensive", "flamer", "heavy", "ineffective",
  "inflict", "loud", "penetrating", "rapidfire", "reach", "reliable", "rend",
  "shield", "spread", "subtle", "supercharge", "thrown", "twohanded", "unstable",
  "bulky", "shoddy", "ugly", "unreliable", "lightweight", "mastercrafted",
  "ornamental", "durable", "haywire"
]);

function getCustomTraitDefinitions() {
  const traitsJson = game.settings.get(MODULE_ID, "customTraits") || "[]";
  const defs = {};
  
  try {
    const traits = JSON.parse(traitsJson);
    for (const trait of traits) {
      if (trait.name && trait.description) {
        const baseName = trait.name.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
        defs[baseName] = {
          displayName: trait.name,
          description: trait.description
        };
      }
    }
  } catch (e) {
    console.warn(`${MODULE_ID} | Failed to parse custom traits:`, e);
  }
  
  return defs;
}

function parseTraits(s) {
  if (!s?.trim()) return [];
  
  const traits = [];
  const traitPatterns = [
    { pattern: /\bBlast\s*\((\d+)\)/gi, key: "blast", hasValue: true },
    { pattern: /\bBurst\s*\((\d+)\)/gi, key: "burst", hasValue: true },
    { pattern: /\bClose\b/gi, key: "close" },
    { pattern: /\bDefensive\b/gi, key: "defensive" },
    { pattern: /\bFlamer\b/gi, key: "flamer" },
    { pattern: /\bHeavy\s*\((\d+)\)/gi, key: "heavy", hasValue: true },
    { pattern: /\bIneffective\b/gi, key: "ineffective" },
    { pattern: /\bInflict\s*\(([^)]+)\)/gi, key: "inflict", hasValue: true },
    { pattern: /\bLoud\b/gi, key: "loud" },
    { pattern: /\bPenetrating\s*\((\d+)\)/gi, key: "penetrating", hasValue: true },
    { pattern: /\bRapid\s*Fire\s*\((\d+)\)/gi, key: "rapidfire", hasValue: true },
    { pattern: /\bRapidFire\s*\((\d+)\)/gi, key: "rapidfire", hasValue: true },
    { pattern: /\bReach\s*\(([^)]+)\)/gi, key: "reach", hasValue: true },
    { pattern: /\bReliable\b/gi, key: "reliable" },
    { pattern: /\bRend\s*\((\d+)\)/gi, key: "rend", hasValue: true },
    { pattern: /\bShield\s*\((\d+)\)/gi, key: "shield", hasValue: true },
    { pattern: /\bShield\b/gi, key: "shield" },
    { pattern: /\bSpread\b/gi, key: "spread" },
    { pattern: /\bSubtle\b/gi, key: "subtle" },
    { pattern: /\bSupercharge\b/gi, key: "supercharge" },
    { pattern: /\bThrown\s*\(([^)]+)\)/gi, key: "thrown", hasValue: true },
    { pattern: /\bThrown\b/gi, key: "thrown" },
    { pattern: /\bTwo-?Handed\b/gi, key: "twohanded" },
    { pattern: /\bUnstable\b/gi, key: "unstable" },
    { pattern: /\bBulky\b/gi, key: "bulky" },
    { pattern: /\bShoddy\b/gi, key: "shoddy" },
    { pattern: /\bUgly\b/gi, key: "ugly" },
    { pattern: /\bUnreliable\b/gi, key: "unreliable" },
    { pattern: /\bLightweight\b/gi, key: "lightweight" },
    { pattern: /\bMastercrafted\b/gi, key: "mastercrafted" },
    { pattern: /\bMaster-?crafted\b/gi, key: "mastercrafted" },
    { pattern: /\bOrnamental\b/gi, key: "ornamental" },
    { pattern: /\bDurable\b/gi, key: "durable" },
    { pattern: /\bHaywire\b/gi, key: "haywire" }
  ];
  
  const foundKeys = new Set();
  
  for (const { pattern, key, hasValue } of traitPatterns) {
    let match;
    while ((match = pattern.exec(s)) !== null) {
      if (foundKeys.has(key)) continue;
      foundKeys.add(key);
      
      const trait = { key };
      if (hasValue && match[1]) {
        trait.value = match[1];
      }
      traits.push(trait);
    }
  }
  
  return traits;
}

function parseTraitsWithCustom(traitsStr, customTraitDefs = {}) {
  const traits = parseTraits(traitsStr);
  const customTraitNotes = [];
  
  if (!traitsStr?.trim() || Object.keys(customTraitDefs).length === 0) {
    return { traits, customTraitNotes: "" };
  }
  
  const traitParts = traitsStr.split(/,\s*/);
  
  for (const part of traitParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    const baseName = trimmed.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
    const isSystemTrait = SYSTEM_TRAIT_KEYS.has(baseName.replace(/\s+/g, ""));
    
    if (!isSystemTrait && customTraitDefs[baseName]) {
      const def = customTraitDefs[baseName];
      customTraitNotes.push(`<p><strong>${trimmed}:</strong> ${def.description}</p>`);
    }
  }
  
  return {
    traits,
    customTraitNotes: customTraitNotes.join("\n")
  };
}

/* -------------------------------------------- */
/* Format Paste                                 */
/* -------------------------------------------- */

function formatPastedText(text) {
  const lines = text.split("\n");
  const formatted = [];
  
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    
    // Skip header lines
    if (/^(Name|Weapon|Armour|Protection|Force Field)/i.test(line)) continue;
    
    // Replace multiple spaces/tabs with pipe delimiter
    let formatted_line = line
      .replace(/\t+/g, " | ")
      .replace(/\s{2,}/g, " | ")
      .replace(/\|\s*\|/g, "|")
      .trim();
    
    // Clean up extra pipes
    formatted_line = formatted_line.replace(/^\||\|$/g, "").trim();
    
    formatted.push(formatted_line);
  }
  
  return formatted.join("\n");
}

// Make classes globally available
window.IMItemImporterApp = IMItemImporterApp;
window.CustomTraitsConfig = CustomTraitsConfig;
