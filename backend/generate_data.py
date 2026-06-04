import os
import json
import random
import hashlib

import faiss
import numpy as np
import networkx as nx

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

random.seed(42)
np.random.seed(42)
os.makedirs("data", exist_ok=True)

# ─────────────────────────────────────────────────────
# ALL 30 SCENARIO ENTITIES
# ─────────────────────────────────────────────────────
ALL_ENTITIES = [
    # SCN-001: Hidden Ownership (Meridian Holdings)
    {"id": "Meridian Holdings Ltd", "type": "Company", "risk": 85},
    {"id": "BVI Shell Alpha", "type": "Company", "risk": 60},
    {"id": "Kasarov Enterprises", "type": "Company", "risk": 75},
    {"id": "Viktor Kasarov", "type": "Person", "risk": 95},

    # SCN-002: Sanctions Exposure / Shared Directors
    {"id": "Vertex Capital", "type": "Company", "risk": 20},
    {"id": "Ocean Logistics", "type": "Company", "risk": 55},
    {"id": "Harbor Group", "type": "Company", "risk": 65},
    {"id": "Red Star Shipping", "type": "Company", "risk": 99},

    # SCN-003: Shared Infrastructure
    {"id": "Horizon Group", "type": "Company", "risk": 85},
    {"id": "123 Offshore Blvd", "type": "Address", "risk": 90},
    {"id": "Phantom Logistics", "type": "Company", "risk": 95},

    # SCN-004: Shortest Laundering Chain
    {"id": "Jonathan Doe", "type": "Person", "risk": 70},
    {"id": "Cayman Account 99X", "type": "Account", "risk": 85},
    {"id": "Apex Ventures", "type": "Company", "risk": 90},
    {"id": "Global Launderers LLC", "type": "Company", "risk": 100},

    # SCN-005: Cayman Islands Trust Beneficiaries
    {"id": "Pacific Holdings", "type": "Company", "risk": 70},
    {"id": "Cayman Trust Alpha", "type": "Trust", "risk": 80},
    {"id": "Cyprus Entity Sigma", "type": "Company", "risk": 75},
    {"id": "Marco Bellini", "type": "Person", "risk": 85},
    {"id": "Elena Voronova", "type": "Person", "risk": 80},

    # SCN-006: 2-Degree Separation from Sanctioned Entity
    {"id": "Black Sea Trading Co", "type": "Company", "risk": 99},
    {"id": "Shell Co Delta", "type": "Company", "risk": 70},
    {"id": "Shell Co Epsilon", "type": "Company", "risk": 65},
    {"id": "Shell Co Zeta", "type": "Company", "risk": 60},
    {"id": "Bank Account BKA-001", "type": "Account", "risk": 85},
    {"id": "Bank Account BKA-002", "type": "Account", "risk": 80},
    {"id": "Registered Agent Omega", "type": "Person", "risk": 70},
    {"id": "Fortune500 Supplier Alpha", "type": "Company", "risk": 30},
    {"id": "Fortune500 Supplier Beta", "type": "Company", "risk": 25},

    # SCN-007: PEP Director Links
    {"id": "Helios Maritime", "type": "Company", "risk": 60},
    {"id": "Delta Chartering", "type": "Company", "risk": 65},
    {"id": "Sergey Molotov", "type": "Person", "risk": 90},
    {"id": "Ministry of Energy", "type": "Entity", "risk": 95},

    # SCN-008: Circular Ownership Loop
    {"id": "Orion Ventures", "type": "Company", "risk": 75},
    {"id": "Nova Holdings", "type": "Company", "risk": 70},
    {"id": "Atlas Partners", "type": "Company", "risk": 65},

    # SCN-009: Transaction Flow to Sanctioned Entity
    {"id": "Baltic Import Ltd", "type": "Company", "risk": 60},
    {"id": "Silver Route FZE", "type": "Company", "risk": 75},
    {"id": "Obsidian Brokers", "type": "Company", "risk": 85},
    {"id": "Red Flag Minerals", "type": "Company", "risk": 100},

    # SCN-010: Ultimate Controlling Person
    {"id": "Northbridge Advisory SPC", "type": "Company", "risk": 70},
    {"id": "Elm Foundation", "type": "Trust", "risk": 65},
    {"id": "Larch Nominees", "type": "Company", "risk": 60},
    {"id": "Chang Wei", "type": "Person", "risk": 80},

    # SCN-011: Shared Bank Account
    {"id": "Emerald Gate LLC", "type": "Company", "risk": 70},
    {"id": "Bank Account BA-77192", "type": "Account", "risk": 75},
    {"id": "Neptune Clearing", "type": "Company", "risk": 65},
    {"id": "First Vale Trading", "type": "Company", "risk": 60},

    # SCN-012: Shell Company Registrar
    {"id": "Blue Reef Corporate Services", "type": "Company", "risk": 70},
    {"id": "Harborline SA", "type": "Company", "risk": 65},
    {"id": "Dune Path Ltd", "type": "Company", "risk": 60},
    {"id": "Copper Crest Inc", "type": "Company", "risk": 60},

    # SCN-013: Overlapping Directors + Sanctioned Board
    {"id": "Luma Capital", "type": "Company", "risk": 55},
    {"id": "Granite Freight", "type": "Company", "risk": 60},
    {"id": "Pavel Ivanenko", "type": "Person", "risk": 85},
    {"id": "Black Harbor Metals", "type": "Company", "risk": 99},

    # SCN-014: High-Risk Cluster / Shared Address
    {"id": "88 Coral Street", "type": "Address", "risk": 90},
    {"id": "Azure Import", "type": "Company", "risk": 70},
    {"id": "Reefline Cargo", "type": "Company", "risk": 65},
    {"id": "Tundra Exports", "type": "Company", "risk": 99},

    # SCN-015: Cross-Border Chain to Sanctioned Entity
    {"id": "Lotus Finance", "type": "Company", "risk": 55},
    {"id": "Dubai Gateway FZE", "type": "Company", "risk": 75},
    {"id": "Baltic Resource OU", "type": "Company", "risk": 80},
    {"id": "Sanctioned Entity RU-99", "type": "Company", "risk": 99},

    # SCN-016: Sanctioned Controller of Medical Supplier
    {"id": "Atlas Medical Supplies", "type": "Company", "risk": 50},
    {"id": "Pearl Midco", "type": "Company", "risk": 65},
    {"id": "North Channel Holdings", "type": "Company", "risk": 80},
    {"id": "Sanctioned Individual Petrov", "type": "Person", "risk": 99},

    # SCN-017: Rapid Pass-Through Transfers
    {"id": "Riverbend Exchange", "type": "Company", "risk": 80},
    {"id": "Falcon Custody", "type": "Company", "risk": 75},
    {"id": "Tidebridge Finance", "type": "Company", "risk": 70},

    # SCN-018: Indirect Sanctions Exposure (Meridian Health)
    {"id": "Meridian Health Ventures", "type": "Company", "risk": 50},
    {"id": "Greyline Holdings", "type": "Company", "risk": 65},
    {"id": "PEP Azarov Dmitri", "type": "Person", "risk": 95},

    # SCN-019: Layering Pattern
    {"id": "Pinebridge Traders", "type": "Company", "risk": 75},
    {"id": "Solaris FZE", "type": "Company", "risk": 80},
    {"id": "Kappa Finance", "type": "Company", "risk": 85},
    {"id": "Sanctioned Entity CN-17", "type": "Company", "risk": 99},

    # SCN-020: Shell Layer Count
    {"id": "Crescent Bio Ltd", "type": "Company", "risk": 60},
    {"id": "Trident Holdings", "type": "Company", "risk": 65},
    {"id": "Silver Reed Corp", "type": "Company", "risk": 70},
    {"id": "Beneficiary Morozov", "type": "Person", "risk": 85},

    # SCN-021: Shared Sanctioned Counterparty
    {"id": "Alta Freight Solutions", "type": "Company", "risk": 65},
    {"id": "Delta Marine Brokers", "type": "Company", "risk": 60},
    {"id": "Red Lantern Commodities", "type": "Company", "risk": 99},

    # SCN-022: PEP Influence Chain
    {"id": "PEP Natalia Sokolova", "type": "Person", "risk": 95},
    {"id": "East Crown Foundation", "type": "Trust", "risk": 80},
    {"id": "Westbridge Capital", "type": "Company", "risk": 60},

    # SCN-023: Sanctions Risk Propagation
    {"id": "Arctic Minerals PLC", "type": "Company", "risk": 99},
    {"id": "Polar Shipping", "type": "Company", "risk": 80},
    {"id": "Glacier Finance", "type": "Company", "risk": 70},

    # SCN-024: Board Interlocks
    {"id": "NovaTech Distribution", "type": "Company", "risk": 55},
    {"id": "Ivan Lebedev", "type": "Person", "risk": 90},
    {"id": "Volga Electronics", "type": "Company", "risk": 99},

    # SCN-025: Transaction-Based Link
    {"id": "Crownline Energy", "type": "Company", "risk": 60},
    {"id": "Helix Trade", "type": "Company", "risk": 75},
    {"id": "Red Banner Metals", "type": "Company", "risk": 95},

    # SCN-026: Offshore Jurisdictions Chain
    {"id": "Beacon Investment Partners", "type": "Company", "risk": 70},
    {"id": "BVI Holdco Gamma", "type": "Company", "risk": 75},
    {"id": "Cayman SPV Theta", "type": "Company", "risk": 80},
    {"id": "Cyprus Trust Iota", "type": "Trust", "risk": 78},
    {"id": "Anton Kruger", "type": "Person", "risk": 85},

    # SCN-027: Multiple Final Beneficiaries
    {"id": "Summit Advisory Group", "type": "Company", "risk": 70},
    {"id": "Layla Haddad", "type": "Person", "risk": 80},
    {"id": "Omar Nasser", "type": "Person", "risk": 82},

    # SCN-028: Correspondent Bank Path
    {"id": "Orion Pay", "type": "Company", "risk": 75},
    {"id": "Delta Correspondent AG", "type": "Company", "risk": 70},
    {"id": "Sanctioned Entity MX-44", "type": "Company", "risk": 99},

    # SCN-029: Bridge Entity
    {"id": "Sunrise Commodities", "type": "Company", "risk": 60},
    {"id": "Frostline Brokers", "type": "Company", "risk": 80},
    {"id": "Sanctioned Entity OFAC-12", "type": "Company", "risk": 99},

    # SCN-030: Lagoon Ventures Cluster
    {"id": "Lagoon Ventures", "type": "Company", "risk": 70},
    {"id": "Coral Assets", "type": "Company", "risk": 65},
    {"id": "Nereid Trading", "type": "Company", "risk": 68},
    {"id": "Viktor Merenkov", "type": "Person", "risk": 90},
]

# ─────────────────────────────────────────────────────
# ALL 30 SCENARIO EDGES (relationships)
# ─────────────────────────────────────────────────────
ALL_EDGES = [
    # SCN-001
    ("BVI Shell Alpha", "Meridian Holdings Ltd", "OWNS"),
    ("Kasarov Enterprises", "BVI Shell Alpha", "CONTROLS"),
    ("Viktor Kasarov", "Kasarov Enterprises", "OWNS"),

    # SCN-002
    ("Vertex Capital", "Ocean Logistics", "FUNDED"),
    ("Ocean Logistics", "Harbor Group", "SHARES_DIRECTOR"),
    ("Harbor Group", "Red Star Shipping", "OWNS"),

    # SCN-003
    ("Horizon Group", "123 Offshore Blvd", "REGISTERED_AT"),
    ("Phantom Logistics", "123 Offshore Blvd", "REGISTERED_AT"),

    # SCN-004
    ("Jonathan Doe", "Cayman Account 99X", "WIRE_TRANSFER"),
    ("Cayman Account 99X", "Apex Ventures", "HELD_BY"),
    ("Apex Ventures", "Global Launderers LLC", "TRANSACTED_WITH"),

    # SCN-005
    ("Pacific Holdings", "Cayman Trust Alpha", "OWNS"),
    ("Cayman Trust Alpha", "Cyprus Entity Sigma", "CONTROLS"),
    ("Cyprus Entity Sigma", "Marco Bellini", "BENEFICIARY"),
    ("Cyprus Entity Sigma", "Elena Voronova", "BENEFICIARY"),

    # SCN-006
    ("Black Sea Trading Co", "Shell Co Delta", "CONTROLS"),
    ("Black Sea Trading Co", "Shell Co Epsilon", "CONTROLS"),
    ("Black Sea Trading Co", "Shell Co Zeta", "CONTROLS"),
    ("Black Sea Trading Co", "Bank Account BKA-001", "HOLDS"),
    ("Black Sea Trading Co", "Bank Account BKA-002", "HOLDS"),
    ("Black Sea Trading Co", "Registered Agent Omega", "REGISTERED_BY"),
    ("Shell Co Delta", "Fortune500 Supplier Alpha", "TRANSACTED_WITH"),
    ("Shell Co Epsilon", "Fortune500 Supplier Beta", "TRANSACTED_WITH"),

    # SCN-007
    ("Helios Maritime", "Sergey Molotov", "DIRECTOR"),
    ("Delta Chartering", "Sergey Molotov", "DIRECTOR"),
    ("Sergey Molotov", "Ministry of Energy", "AFFILIATED_WITH"),

    # SCN-008
    ("Orion Ventures", "Nova Holdings", "OWNS"),
    ("Nova Holdings", "Atlas Partners", "CONTROLS"),
    ("Atlas Partners", "Orion Ventures", "OWNS"),

    # SCN-009
    ("Baltic Import Ltd", "Silver Route FZE", "PAID"),
    ("Silver Route FZE", "Obsidian Brokers", "FUNDED"),
    ("Obsidian Brokers", "Red Flag Minerals", "REMITTED"),

    # SCN-010
    ("Northbridge Advisory SPC", "Elm Foundation", "CONTROLLED_BY"),
    ("Elm Foundation", "Larch Nominees", "CONTROLLED_BY"),
    ("Larch Nominees", "Chang Wei", "CONTROLLED_BY"),

    # SCN-011
    ("Emerald Gate LLC", "Bank Account BA-77192", "USES"),
    ("Neptune Clearing", "Bank Account BA-77192", "USES"),
    ("First Vale Trading", "Bank Account BA-77192", "USES"),

    # SCN-012
    ("Blue Reef Corporate Services", "Harborline SA", "REGISTERED"),
    ("Blue Reef Corporate Services", "Dune Path Ltd", "REGISTERED"),
    ("Blue Reef Corporate Services", "Copper Crest Inc", "REGISTERED"),

    # SCN-013
    ("Luma Capital", "Pavel Ivanenko", "DIRECTOR"),
    ("Granite Freight", "Pavel Ivanenko", "DIRECTOR"),
    ("Pavel Ivanenko", "Black Harbor Metals", "DIRECTOR"),
    ("Black Harbor Metals", "Pavel Ivanenko", "DIRECTOR"),

    # SCN-014
    ("Azure Import", "88 Coral Street", "REGISTERED_AT"),
    ("Reefline Cargo", "88 Coral Street", "REGISTERED_AT"),
    ("Tundra Exports", "88 Coral Street", "REGISTERED_AT"),

    # SCN-015
    ("Lotus Finance", "Dubai Gateway FZE", "FUNDED"),
    ("Dubai Gateway FZE", "Baltic Resource OU", "PAID"),
    ("Baltic Resource OU", "Sanctioned Entity RU-99", "TRANSACTED_WITH"),

    # SCN-016
    ("Atlas Medical Supplies", "Pearl Midco", "OWNED_BY"),
    ("Pearl Midco", "North Channel Holdings", "CONTROLLED_BY"),
    ("North Channel Holdings", "Sanctioned Individual Petrov", "CONTROLLED_BY"),

    # SCN-017
    ("Riverbend Exchange", "Falcon Custody", "ROUTES_THROUGH"),
    ("Falcon Custody", "Tidebridge Finance", "ROUTES_THROUGH"),

    # SCN-018
    ("Meridian Health Ventures", "Greyline Holdings", "OWNED_BY"),
    ("Greyline Holdings", "PEP Azarov Dmitri", "CONTROLLED_BY"),

    # SCN-019
    ("Pinebridge Traders", "Solaris FZE", "PAID"),
    ("Solaris FZE", "Kappa Finance", "PAID"),
    ("Kappa Finance", "Sanctioned Entity CN-17", "REMITTED"),

    # SCN-020
    ("Crescent Bio Ltd", "Trident Holdings", "OWNED_BY"),
    ("Trident Holdings", "Silver Reed Corp", "OWNED_BY"),
    ("Silver Reed Corp", "Beneficiary Morozov", "BENEFICIARY"),

    # SCN-021
    ("Alta Freight Solutions", "Red Lantern Commodities", "TRANSACTED_WITH"),
    ("Harborline SA", "Red Lantern Commodities", "TRANSACTED_WITH"),
    ("Delta Marine Brokers", "Red Lantern Commodities", "TRANSACTED_WITH"),

    # SCN-022
    ("PEP Natalia Sokolova", "East Crown Foundation", "CONTROLS"),
    ("East Crown Foundation", "Westbridge Capital", "APPOINTS_DIRECTORS"),

    # SCN-023
    ("Arctic Minerals PLC", "Polar Shipping", "CONTROLS"),
    ("Polar Shipping", "Glacier Finance", "CONTROLS"),

    # SCN-024
    ("NovaTech Distribution", "Ivan Lebedev", "DIRECTOR"),
    ("Volga Electronics", "Ivan Lebedev", "DIRECTOR"),

    # SCN-025
    ("Crownline Energy", "Helix Trade", "PAYS"),
    ("Helix Trade", "Red Banner Metals", "TRANSACTED_WITH"),

    # SCN-026
    ("Beacon Investment Partners", "BVI Holdco Gamma", "OWNED_BY"),
    ("BVI Holdco Gamma", "Cayman SPV Theta", "OWNED_BY"),
    ("Cayman SPV Theta", "Cyprus Trust Iota", "OWNED_BY"),
    ("Cyprus Trust Iota", "Anton Kruger", "BENEFICIARY"),

    # SCN-027
    ("Summit Advisory Group", "Layla Haddad", "BENEFICIARY"),
    ("Summit Advisory Group", "Omar Nasser", "BENEFICIARY"),

    # SCN-028
    ("Orion Pay", "Delta Correspondent AG", "ROUTED_THROUGH"),
    ("Delta Correspondent AG", "Sanctioned Entity MX-44", "PAID"),

    # SCN-029
    ("Sunrise Commodities", "Frostline Brokers", "TRANSACTED_WITH"),
    ("Frostline Brokers", "Sanctioned Entity OFAC-12", "TRANSACTED_WITH"),

    # SCN-030
    ("Lagoon Ventures", "Viktor Merenkov", "BENEFICIARY"),
    ("Coral Assets", "Viktor Merenkov", "BENEFICIARY"),
    ("Nereid Trading", "Viktor Merenkov", "BENEFICIARY"),
]

# ─────────────────────────────────────────────────────
# ALL 30 SCENARIO SEED DOCUMENTS (for vector RAG)
# ─────────────────────────────────────────────────────
ALL_DOCS = [
    # SCN-001
    "Meridian Holdings Ltd is wholly owned by BVI Shell Alpha.",
    "BVI Shell Alpha's majority controller is Kasarov Enterprises.",
    "Viktor Kasarov is the sole owner of Kasarov Enterprises.",
    # SCN-002
    "Vertex Capital funded Ocean Logistics with a $5M loan.",
    "Ocean Logistics shares director Elena Rostova with Harbor Group.",
    "Harbor Group owns Red Star Shipping, a sanctioned entity.",
    # SCN-003
    "Horizon Group is registered at 123 Offshore Blvd.",
    "Phantom Logistics is a known sanctioned entity at 123 Offshore Blvd.",
    # SCN-004
    "Jonathan Doe wired $150k to Cayman Account 99X.",
    "Cayman Account 99X is held by Apex Ventures.",
    "Apex Ventures transacted with Global Launderers LLC.",
    # SCN-005
    "Pacific Holdings owns Cayman Trust Alpha.",
    "Cayman Trust Alpha controls Cyprus Entity Sigma.",
    "Cyprus Entity Sigma's beneficiaries are Marco Bellini and Elena Voronova.",
    # SCN-006
    "Black Sea Trading Co directly controls Shell Co Delta, Shell Co Epsilon, and Shell Co Zeta.",
    "Black Sea Trading Co holds Bank Account BKA-001 and BKA-002.",
    "Black Sea Trading Co was incorporated by Registered Agent Omega.",
    "Shell Co Delta transacted with Fortune500 Supplier Alpha.",
    "Shell Co Epsilon transacted with Fortune500 Supplier Beta.",
    # SCN-007
    "Helios Maritime lists Sergey Molotov as director.",
    "Delta Chartering also lists Sergey Molotov as director.",
    "Sergey Molotov is affiliated with the Ministry of Energy, a state body.",
    # SCN-008
    "Orion Ventures owns 40% of Nova Holdings.",
    "Nova Holdings controls Atlas Partners.",
    "Atlas Partners owns shares in Orion Ventures, forming a circular loop.",
    # SCN-009
    "Baltic Import Ltd paid Silver Route FZE for freight services.",
    "Silver Route FZE funded Obsidian Brokers.",
    "Obsidian Brokers remitted funds to sanctioned Red Flag Minerals.",
    # SCN-010
    "Northbridge Advisory SPC is controlled via Elm Foundation.",
    "Elm Foundation is controlled by Larch Nominees.",
    "Larch Nominees is ultimately controlled by Chang Wei.",
    # SCN-011
    "Emerald Gate LLC uses Bank Account BA-77192.",
    "Neptune Clearing also uses Bank Account BA-77192.",
    "First Vale Trading shares Bank Account BA-77192 with both.",
    # SCN-012
    "Blue Reef Corporate Services registered Harborline SA.",
    "Blue Reef Corporate Services registered Dune Path Ltd.",
    "Blue Reef Corporate Services registered Copper Crest Inc.",
    # SCN-013
    "Luma Capital and Granite Freight share director Pavel Ivanenko.",
    "Pavel Ivanenko also serves as director of sanctioned Black Harbor Metals.",
    # SCN-014
    "Azure Import, Reefline Cargo, and Tundra Exports all share address 88 Coral Street.",
    "Tundra Exports is a sanctioned entity.",
    # SCN-015
    "Lotus Finance funded Dubai Gateway FZE.",
    "Dubai Gateway FZE paid Baltic Resource OU.",
    "Baltic Resource OU transacted with sanctioned entity RU-99.",
    # SCN-016
    "Atlas Medical Supplies is owned by Pearl Midco.",
    "Pearl Midco is controlled by North Channel Holdings.",
    "North Channel Holdings is controlled by sanctioned individual Petrov.",
    # SCN-017
    "Riverbend Exchange routes rapid pass-through transfers via Falcon Custody.",
    "Falcon Custody passes funds through Tidebridge Finance.",
    # SCN-018
    "Meridian Health Ventures is held by Greyline Holdings.",
    "Greyline Holdings is controlled by PEP Azarov Dmitri.",
    # SCN-019
    "Pinebridge Traders paid Solaris FZE.",
    "Solaris FZE paid Kappa Finance.",
    "Kappa Finance remitted to sanctioned entity CN-17.",
    # SCN-020
    "Crescent Bio Ltd is owned by Trident Holdings.",
    "Trident Holdings is owned by Silver Reed Corp.",
    "Silver Reed Corp's beneficiary is Morozov.",
    # SCN-021
    "Alta Freight Solutions, Harborline SA, and Delta Marine Brokers all transact with sanctioned Red Lantern Commodities.",
    # SCN-022
    "PEP Natalia Sokolova controls East Crown Foundation.",
    "East Crown Foundation appoints directors at Westbridge Capital.",
    # SCN-023
    "Arctic Minerals PLC is sanctioned and controls Polar Shipping.",
    "Polar Shipping controls Glacier Finance.",
    # SCN-024
    "NovaTech Distribution and Volga Electronics share board member Ivan Lebedev.",
    "Volga Electronics is under sanctions.",
    # SCN-025
    "Crownline Energy pays Helix Trade.",
    "Helix Trade transacted with Red Banner Metals, a sanctioned entity.",
    # SCN-026
    "Beacon Investment Partners is owned by BVI Holdco Gamma.",
    "BVI Holdco Gamma is owned by Cayman SPV Theta.",
    "Cayman SPV Theta is owned by Cyprus Trust Iota.",
    "Cyprus Trust Iota's beneficiary is Anton Kruger.",
    # SCN-027
    "Summit Advisory Group resolves to two final beneficiaries: Layla Haddad and Omar Nasser.",
    # SCN-028
    "Orion Pay routed transfers via Delta Correspondent AG.",
    "Delta Correspondent AG paid sanctioned entity MX-44.",
    # SCN-029
    "Frostline Brokers is the bridge entity connecting Sunrise Commodities to sanctioned entity OFAC-12.",
    # SCN-030
    "Lagoon Ventures, Coral Assets, and Nereid Trading are all ultimately controlled by Viktor Merenkov through layered trusts.",
]


def _fallback_embed(documents: list[str], dim: int = 384) -> np.ndarray:
    """Deterministic local embedding fallback when sentence-transformers is unavailable."""
    mat = np.zeros((len(documents), dim), dtype=np.float32)
    for i, text in enumerate(documents):
        tokens = text.lower().split()
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            idx = int.from_bytes(digest[:4], "little") % dim
            sign = 1.0 if (digest[4] % 2 == 0) else -1.0
            mat[i, idx] += sign
        norm = np.linalg.norm(mat[i])
        if norm > 0:
            mat[i] /= norm
    return mat


# ─────────────────────────────────────────────────────
# BUILD GRAPH
# ─────────────────────────────────────────────────────
G = nx.DiGraph()
for entity in ALL_ENTITIES:
    G.add_node(entity["id"], type=entity["type"], risk_score=entity["risk"])
for src, tgt, rel in ALL_EDGES:
    G.add_edge(src, tgt, relation=rel)

nx.write_gml(G, "data/graph.gml")
print(f"✓ graph.gml: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

# ─────────────────────────────────────────────────────
# BUILD VECTOR INDEX (FAISS + sentence-transformers)
# ─────────────────────────────────────────────────────
if SentenceTransformer is not None:
    model = SentenceTransformer("all-MiniLM-L6-v2")
    embeddings = model.encode(ALL_DOCS, show_progress_bar=True).astype("float32")
else:
    print("[generate_data] sentence-transformers unavailable; using deterministic fallback embeddings.")
    embeddings = _fallback_embed(ALL_DOCS, dim=384)

index = faiss.IndexFlatL2(embeddings.shape[1])
index.add(embeddings)
faiss.write_index(index, "data/vector_index.faiss")
print(f"✓ vector_index.faiss: {index.ntotal} vectors")

# ─────────────────────────────────────────────────────
# SAVE CHUNKS JSON (for pipeline2_basic_rag)
# ─────────────────────────────────────────────────────
import uuid
chunks = [
    {"id": str(uuid.uuid4()), "source": "synthetic_scenarios", "chunk_index": i, "text": doc}
    for i, doc in enumerate(ALL_DOCS)
]
with open("data/chunks.json", "w") as f:
    json.dump(chunks, f, indent=2)
print(f"✓ chunks.json: {len(chunks)} chunks")
print("\nAll data files generated successfully!")
