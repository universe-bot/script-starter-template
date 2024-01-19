//@ts-nocheck this will be removed shortly as missing types are added to the API

/**
 * Example Script:
 * BerryFarmer collects berries along a configureable path on the map.
 * Note: Channel switching is not supported by UniCore API at this time,
 * once that is implemented, efficiency of this can be improved significantly.
 * 
 * Locations for the Berries: 
 * Cloudberry -> Flaris, St. Morning, Garden of Rhisis
 * Lightberry -> Darkon 1 & 2
 * Exoberry -> Darkon 3 & Azria (Potentially Coral? Not confirmed)
 * 
 * Auto-Purchase Gloves:
 * When active, the script will check if the current player is in possession of
 * the harvesting gloves. If not, it will find the nearest vendor for it 
 * and purchase harvesting gloves automatically IF enough penya is present.
 * If not enough penya is present or Auto-Purchase Gloves is disabled,
 * an error message will be presented to the user.
 * 
 * Auto-Produce Candy:
 * @TODO: Potentially, the bot could automate these actions.
 */

/**
 * Load the required UniCore API modules and helper references.
 */
import { UniCore } from 'unibot-api/UniCore';
import { UniNavigation } from 'unibot-api/UniNavigation';
import { NPCShopWindow, PlayerMenu, UniGameUI } from 'unibot-api/UniGameUI';
import { PLAYER_EQUIP_SLOT } from 'unibot-api/Types/UniPlayer';
import type { IVector3 } from 'unibot-api/VectorMath';
import type { IPlayer, InventoryItem, Material } from 'unibot-api/Types/FlyffEntities';
import type { UniMover } from 'unibot-api/Types/UniMover';


/**
 * Load the required BehaviourModules.
 */
import { DeathBehaviour } from 'unibot-api/BehaviourBlocks/DeathBehaviour';
import { UniCombat } from 'unibot-api/UniCombat';


const ScriptConfiguration = UniCore.GetScriptConfig();

/**
 * Some constants so that we dont have hardcoded values scattered around everywhere.
 */
const WAYPOINT_REACH_DISTANCE = 10;
const HARVEST_REACH_DISTANCE = 2;

const ANIMSTATE_HARVESTING = 68;
const ITEMID_HARVESTING_GLOVES = 4004;
const ITEMID_POWERDICE_8 = 3231;
const ITEMID_CLOUDBERRY = 3400;
const ITEMID_LIGHTBERRY = 3401;
const ITEMID_EXOBERRY = 3402;

// These are the gamePropID's of the berry bushes
const MOVERID_CLOUDBERRY_BUSH = 47;
const MOVERID_LIGHTBERRY_BUSH = 48;
const MOVERID_EXOBERRY_BUSH = 49;

// These are the gamePropID's of the mobs that can spawn after collecting a berry bush.
const MOVERID_CLOUDBERRY_CARRIER_ROOKIE = 1900;
const MOVERID_CLOUDBERRY_CARRIER = 1901;
const MOVERID_LIGHTBERRY_CARRIER = 1902;
const MOVERID_EXOBERRY_CARRIER_ROOKIE = 1903;
const MOVERID_EXOBERRY_CARRIER = 1904;

// Wrap the carrier gamePropID's in an array for easy usage later
const MOVERID_LIST_CARRIERS = [
    MOVERID_CLOUDBERRY_CARRIER_ROOKIE,
    MOVERID_CLOUDBERRY_CARRIER,
    MOVERID_LIGHTBERRY_CARRIER,
    MOVERID_EXOBERRY_CARRIER_ROOKIE,
    MOVERID_EXOBERRY_CARRIER
];

/**
 * State holder object, here we put everyting global that is needed to track at runtime.
 */
const State = {
    RuntimeTracking: {
        lastTickAt: 0,
        totalMilliseconds: 0,
        totalSeconds: 0,
        totalMinutes: 0,
        totalHours: 0,
    },
    Statistics: {
        initialized: false,
        InitialBerryCounts: {
            Cloudberry: 0,
            Lightberry: 0,
            Exoberry: 0
        }
    },
    Navigation: {
        currentWaypointIndex: 0,
        configuredWaypoints: [] as IVector3[],
        noNavigationThisTick: true,
        currentNavigationTarget: { x: 0, y: 0, z: 0 },
        onAbortTick: () => {
            if (State.Navigation.noNavigationThisTick) {
                State.Navigation.currentNavigationTarget = { x: 0, y: 0, z: 0 };
            }
            return State.Navigation.noNavigationThisTick;
        }
    },
    Timers: {
        harvestCooldownGottenAt: 0,
        lastHarvestSuccessAt: 0,
        lastUpgradeAttemptAt: 0
    }
};

/**
 * Setup configuration options for this script
 */
const ConfigSection = {
    Statistics: ScriptConfiguration.AddAccordion({
        label: "Statistics"
    }),
    Path: ScriptConfiguration.AddAccordion({
        label: "Route"
    }),
    Collect: ScriptConfiguration.AddAccordion({
        label: "Collect"
    }),
    Combat: ScriptConfiguration.AddAccordion({
        label: "Combat"
    }),
    Extra: ScriptConfiguration.AddAccordion({
        label: "Extra"
    })
};

const ConfigOption = {
    Statistics: {
        Runtime: ScriptConfiguration.AddBadge({
            label: "Runtime",
            defaultValue: "00:00:00",
            _parent: ConfigSection.Statistics
        }),
        CollectCounts: {
            Cloudberry: ScriptConfiguration.AddBadge({
                label: "Cloudberries collected",
                defaultValue: "0",
                _parent: ConfigSection.Statistics
            }),
            Lightberry: ScriptConfiguration.AddBadge({
                label: "Lightberries collected",
                defaultValue: "0",
                _parent: ConfigSection.Statistics
            }),
            Exoberry: ScriptConfiguration.AddBadge({
                label: "Exoberries collected",
                defaultValue: "0",
                _parent: ConfigSection.Statistics
            })
        },
        NearbyCounts: {
            Cloudberry: ScriptConfiguration.AddBadge({
                label: "Cloudberries nearby",
                defaultValue: "0",
                _parent: ConfigSection.Statistics
            }),
            Lightberry: ScriptConfiguration.AddBadge({
                label: "Lightberries nearby",
                defaultValue: "0",
                _parent: ConfigSection.Statistics
            }),
            Exoberry: ScriptConfiguration.AddBadge({
                label: "Exoberries nearby",
                defaultValue: "0",
                _parent: ConfigSection.Statistics
            })
        },
    },
    Path: {
        WaypointList: ScriptConfiguration.CreateIterable({
            label: "Waypoint List",
            _parent: ConfigSection.Path
        }),
    },
    Combat: {
        killNormalMobs: ScriptConfiguration.AddCheckBox({
            label: "Kill normal aggros",
            defaultValue: false,
            _parent: ConfigSection.Combat
        }),
        killBerryCarriers: ScriptConfiguration.AddCheckBox({
            label: "Kill berry carriers",
            defaultValue: false,
            _parent: ConfigSection.Combat
        }),
        killGiants: ScriptConfiguration.AddCheckBox({
            label: "Kill giants",
            defaultValue: false,
            _parent: ConfigSection.Combat
        }),
    },
    Collect: {
        Cloudberry: ScriptConfiguration.AddCheckBox({
            label: "Collect Cloudberry",
            defaultValue: false,
            _parent: ConfigSection.Collect
        }),
        Lightberry: ScriptConfiguration.AddCheckBox({
            label: "Collect Lightberry",
            defaultValue: false,
            _parent: ConfigSection.Collect
        }),
        Exoberry: ScriptConfiguration.AddCheckBox({
            label: "Collect Exoberry",
            defaultValue: false,
            _parent: ConfigSection.Collect
        })
    },
    Extra: {
        AutoUpgradeGloves: ScriptConfiguration.AddComboBox({
            label: "Upgrade Gloves:",
            values: ["Disabled", "+1", "+2", "+3", "+4", "+5"],
            defaultValue: "Disabled",
            _parent: ConfigSection.Extra
        }),
        PurchaseGloves: ScriptConfiguration.AddCheckBox({
            label: "Purchase Gloves",
            tooltip: "When enabled, the script will automatically purchase \"Harvesting Gloves\" from [Pet Tamer] in flaris if none was found in inventory.",
            defaultValue: false,
            _parent: ConfigSection.Extra
        })
    }
};

//Setup iterable for waypoint list
ConfigOption.Path.WaypointList.AddToShape("UniWorldPositionPicker", {
    label: "Pos",
    defaultValue: { x: 0, z: 0 }
});

//Utilize UniCombat to handle the implementation of the combat system.
const combatHandlerInstance = new UniCombat({
    fightableTargetCondition: (mover: UniMover) => {
        const isBerryCarrier = MOVERID_LIST_CARRIERS.indexOf(mover.get("gamePropID")) >= 0;
        if (isBerryCarrier) {
            // Allow fighting the carrier if fighting them is enabled, otherwise try to stay 10 units away from them.
            return ConfigOption.Combat.killBerryCarriers.GetValue() ? true : 10;
        }

        if (mover.GetRank() == "boss" || mover.GetRank() == "violet" || mover.GetRank() == "giant") {
            // Allow fighting giants if fighting them is enabled, otherwise try to stay 20 units away from them.
            return ConfigOption.Combat.killGiants.GetValue() ? true : 20;
        }

        // the rest of the mobs should be normal monsters, if we dont want to fight them try to stay 10 units away from them if they are aggros.
        return ConfigOption.Combat.killNormalMobs.GetValue() ? true : (mover.IsRedMob() ? 10 : 0);
    },
    desireableTargetCondition: (mover: UniMover) => {
        // Berry farmer only really wants to initiate combat with the berry carriers.
        const isBerryCarrier = MOVERID_LIST_CARRIERS.indexOf(mover.get("gamePropID")) >= 0;
        if (isBerryCarrier) {
            return ConfigOption.Combat.killBerryCarriers.GetValue() ? true : false;
        }
        return false;
    },
    startNavigation: (targetPos: IVector3) => SetNavigationTarget(targetPos),
    configSection: ConfigSection.Combat
});
const deathBehaviour = new DeathBehaviour();

/**
 * This function will be used every tick to ensure the configuration makes sense.
 */
function ValidateScriptConfiguration() {
    const [doCollectCloudberry, doCollectLightberry, doCollectExoberry] = [
        ConfigOption.Collect.Cloudberry.GetValue(),
        ConfigOption.Collect.Lightberry.GetValue(),
        ConfigOption.Collect.Exoberry.GetValue()
    ];

    if (!doCollectCloudberry && !doCollectLightberry && !doCollectExoberry) {
        throw new Error("BerryFarmer started but not configured to collect any berries!");
    }

    if (State.Navigation.configuredWaypoints.length < 2) {
        throw new Error("BerryFarmer started but not configured to navigate anywhere, configure atleast 2 waypoints to use the script!");
    }
}

UniCore.On("system-message", (ids: string) => {
    if (ids == "ids_textclient_harvest_receive") {
        State.Timers.lastHarvestSuccessAt = UniCore.GetMicrotime();
    }

    if (ids == "ids_textclient_harvest_cooldown") {
        // We have gotten the message that we should wait a bit before collecting again
        State.Timers.harvestCooldownGottenAt = UniCore.GetMicrotime();
    }

    if (ids == "ids_textclient_upgrade_fail" || ids == "textclient_upgrade_successful") {
        // Reset upgrade attempt timer when we got a result
        State.Timers.lastUpgradeAttemptAt = 0;
    }
})

/**
 * "tick" event gets thrown by the API when new data is available
 * to the script and we are supposed to do actions. 
 * (UniBot Pro aims for 10 ticks per second)
 */
UniCore.On("tick", () => {
    // New tick, reset the noNavigationThisTick to true so that we can track if we want to navigate this tick
    State.Navigation.noNavigationThisTick = true;

    // Update Waypoint list from config
    UpdateWaypointList();

    // Make sure the script was not configured in a way that makes no sense.
    ValidateScriptConfiguration();

    // Refresh the displayed statistics if appropriate
    UpdateStatisticDisplay();

    if (deathBehaviour.IsDead()) {
        deathBehaviour.HandleDeath();
        return;
    }

    // Top priority is handling combat
    if (combatHandlerInstance.HandleCombat()) return;

    // The first thing we need to ensure is having "Harvesting Gloves" available.
    if (Handle_AutoPurchaseHarvestingGloves()) return;

    // We have "Harvesting Gloves", try to upgrade them as far as the user configured.
    if (Handle_AutoUpgradeHarvestingGloves()) return;

    // Ensure that we are using the best "Harvesting Gloves" that we have available.
    if (Handle_EnsureBestHarvestingGlovesEquipped()) return;

    // If we happen to be standing near a berry bush, try to harvest it.
    if (Handle_HarvestNearbyBerryBushes()) return;

    // We have nothing to collect or do right now other than follow our configured waypoint route.
    if (Handle_WaypointTravel()) return;

    throw new Error("Should not reach this point, script is not sure what to do.");
});

function Handle_WaypointTravel() {
    // we need to figure out where to go next. 
    const player = UniCore.GetCurrentPlayer();
    const currentWaypoint = State.Navigation.configuredWaypoints.at(State.Navigation.currentWaypointIndex % State.Navigation.configuredWaypoints.length);

    if (!currentWaypoint) {
        throw new Error("No next waypoint configured, dont know where to go.");
    }

    const distanceToWaypoint = UniCore.GetDistanceV3(player.GetPosition(), currentWaypoint, true);

    if (distanceToWaypoint < WAYPOINT_REACH_DISTANCE) {
        // We are close enough to the waypoint, increment waypointindex.
        State.Navigation.currentWaypointIndex++;

        UniCore.SetPlayerIntent(`Navigating towards next waypoint.`);
        SetNavigationTarget(State.Navigation.configuredWaypoints[State.Navigation.currentWaypointIndex % State.Navigation.configuredWaypoints.length]);
    } else {
        UniCore.SetPlayerIntent(`Navigating towards next waypoint.`);
        SetNavigationTarget(currentWaypoint);
    }

    return true;
}

/**
 * Handler responsible for looking at nearby bushes and collecting them.
 */
function Handle_HarvestNearbyBerryBushes() {
    const nearbyBerries = FindNearbyBerryBushes();

    if (nearbyBerries.list.length > 0) {
        // We have found berry bushes nearby. Lets pick the closest one
        const closestBerryBush = nearbyBerries.list.sort((a, b) => a.screenPos.z - b.screenPos.z)[0];
        const player = UniCore.GetCurrentPlayer();

        // Check if we are close enough to just click to collect, we can collect items up to 15 units above or below the player
        const distanceToPlayer2d = UniCore.GetDistance(closestBerryBush.worldPos.x, 0, closestBerryBush.worldPos.z, player.GetPosition().x, 0, player.GetPosition().z);
        const heightDifferenceToPlayer = Math.abs(closestBerryBush.worldPos.y - player.GetPosition().y);

        // We can harvest bushes that are quite far in the yAxis so we can allow more distance there
        if (distanceToPlayer2d < HARVEST_REACH_DISTANCE && heightDifferenceToPlayer < HARVEST_REACH_DISTANCE * 3) {
            UniCore.SetPlayerIntent(`Collecting ${GetBerryType(closestBerryBush)} bush.`);

            const isAlreadyCollectingBerries = UniCore.GetCurrentPlayer().get("animationState") == ANIMSTATE_HARVESTING;

            if (!isAlreadyCollectingBerries) {
                if (UniCore.TimeSinceInMilliseconds(State.Timers.harvestCooldownGottenAt) > 1000 && UniCore.TimeSinceInMilliseconds(State.Timers.lastHarvestSuccessAt) > 1000) {
                    UniCore.LimitActionFrequency("COLLECT_BERRIES", 800, () => {
                        UniCore.CollectMaterial(closestBerryBush);
                    });
                }
            }
            return true;
        }

        UniCore.SetPlayerIntent(`Navigating towards ${GetBerryType(closestBerryBush)} bush.`);
        SetNavigationTarget(closestBerryBush.worldPos);
        return true;
    }

    return false;
}

/**
 * Handler function responsible for handling automatic upgrading of "Harvesting Gloves"
 */
function Handle_AutoUpgradeHarvestingGloves() {
    if (ConfigOption.Extra.AutoUpgradeGloves.GetValue() == "Disabled") {
        // User disabled auto upgrade function
        return false;
    }

    const powerDices = FindInventoryItem(ITEMID_POWERDICE_8);
    if (powerDices && powerDices.totalCount == 0) {
        //Only complain about not having enough powerdice 8 for upgrading every 5 minutes.
        UniCore.LimitActionFrequency("COMPLAIN_MISSING_PD8", 5 * 60 * 1000, () => {
            UniCore.LogDespammed(`Can not upgrade "Harvesting Gloves" without "Power Dice 8".`);
        })
        return false;
    }

    const bestGloves = GetBestAvailableHarvestingGloves();
    if (!bestGloves) {
        throw new Error("Reached BerryFarmer Auto Upgrade without owning \"Harvesting Gloves\".")
    }

    const desiredUpgradeCount = parseInt(ConfigOption.Extra.AutoUpgradeGloves.GetValue().slice(0, 2));

    if (bestGloves.upgradeCount == desiredUpgradeCount) {
        // Gloves are already at the desired upgrade count
        return false;
    }

    // If we are currently wearing these gloves, we need to unequip them.
    if (IsWearingBestGloves(bestGloves) && bestGloves.slot == 10) {
        UniCore.LimitActionFrequency("EQUIP_ITEM", 1500, () => {
            UniCore.UseItem(168 + bestGloves.slot, 0);
        });

        return true;
    }

    UniCore.SetPlayerIntent(`Upgrading "Harvesting Gloves" from +${bestGloves.upgradeCount} to +${desiredUpgradeCount}. (${powerDices.totalCount} PD8 remaining)`);

    if (UniCore.TimeSinceInMilliseconds(State.Timers.lastUpgradeAttemptAt) > 10000) {
        UniCore.UseScroll(bestGloves.slot, powerDices.itemStacks[0].slot);
        State.Timers.lastUpgradeAttemptAt = UniCore.GetMicrotime();
    }

    return true;
}

/**
 * Handler function responsible for equipping the best possible "Harvesting Gloves".
 */
function Handle_EnsureBestHarvestingGlovesEquipped() {
    const bestGloves = GetBestAvailableHarvestingGloves();

    if (!bestGloves || IsWearingBestGloves(bestGloves)) {
        // current equipped weapon is our best harvesting glove
        return false;
    }

    // need to equip the gloves
    UniCore.SetPlayerIntent(`Equiping "Harvesting Gloves${bestGloves.upgradeCount > 0 ? " +" + bestGloves.upgradeCount : ""}".`);

    // limit calls to UseItem to make sure we dont spam that action
    UniCore.LimitActionFrequency("EQUIP_ITEM", 1500, () => {
        // doing an update attempt
        UniCore.UseItem(bestGloves.slot, 0);
    });

    return true;
}

/**
 * Handler function responsible for navigating to Pet Tamer and purchasing "Harvesting Gloves".
 */
function Handle_AutoPurchaseHarvestingGloves() {
    const gloves = GetBestAvailableHarvestingGloves();

    // Dont do anything if we already have gloves
    if (gloves || !ConfigOption.Extra.PurchaseGloves.GetValue()) {
        // Ensure NPCShopWindow is closed after done purchasing
        return UniGameUI.Find(NPCShopWindow).CloseWindow();
    }

    const petTamerNPC = UniCore.GetGameDataProvider().FindNPCInstance({ name: "Pet Tamer" });
    if (!petTamerNPC) {
        throw new Error("Pet Tamer NPC not found.");
    }

    if (UniCore.GetCurrentPlayer().GetDistanceTo(petTamerNPC.position) > 2) {
        // We are too far away from the npc, lets move toward it
        UniCore.SetPlayerIntent("Walking to \"Pet Tamer\" to purchase \"Harvesting Gloves\".")

        SetNavigationTarget(petTamerNPC.position);
        return true;
    }

    const npcShopMover = UniCore.GetMoversAround(x => x.IsNPC() && UniCore.GetDistanceV3(x.GetPosition(), petTamerNPC.position) < 2).at(0);

    if (!npcShopMover) {
        throw new Error("We have reached the known position of \"Pet Tamer\" but the NPC is not here.");
    }

    // We are close enough to the npc shop to interact with it
    if (!UniGameUI.Find(NPCShopWindow).IsOpen()) {
        UniCore.LimitActionFrequency("UI_INTERACTION", 800, () => {
            if (!UniGameUI.Find(PlayerMenu).IsOpen()) {
                // Open playermenu by clicking on the NPC Mover
                npcShopMover.Click();
                return;
            }

            // Click on "Trade" which should be the first menu option
            UniGameUI.Find(PlayerMenu).ClickOption(1);
        });
        return true;
    }

    // We are close to the "Pet Tamer" NPC and the shop is open, lets buy harvesting gloves
    UniCore.LimitActionFrequency("PURCHASE_GLOVES", 2000, () => {
        UniCore.BuyItem(npcShopMover.GetID(), ITEMID_HARVESTING_GLOVES, 1);
    });

    return true;
}

/**
 * Helper function responsible for keeping State.Navigation.configuredWaypoints up to date and in sync with the configuration.
 */
function UpdateWaypointList() {
    const currentConfigWaypoints: IVector3[] = [];
    for (const currentWaypointConfig of Array.from(ConfigOption.Path.WaypointList.elements)) {
        const [posPicker] = Array.from(currentWaypointConfig.values);
        const pos = posPicker.GetValue();
        currentConfigWaypoints.push({ ...pos, y: 0 });
    }
    State.Navigation.configuredWaypoints = currentConfigWaypoints;
}

/**
 * This function keeps track of how long the script is active.
 */
function TrackScriptActiveRuntime() {
    const timeSinceLastTick = UniCore.TimeSinceInMilliseconds(State.RuntimeTracking.lastTickAt);

    //If the last tick happened longer than 1 second ago, we were probably paused,
    if (timeSinceLastTick < 1000) {
        State.RuntimeTracking.totalMilliseconds += timeSinceLastTick;
    }

    State.RuntimeTracking.totalSeconds = State.RuntimeTracking.totalMilliseconds / 1000;
    State.RuntimeTracking.totalMinutes = State.RuntimeTracking.totalSeconds / 60;
    State.RuntimeTracking.totalHours = State.RuntimeTracking.totalMinutes / 60;

    State.RuntimeTracking.lastTickAt = UniCore.GetMicrotime();
}

/**
 * This function is responsible for updating the badges in stats.
 */
function UpdateStatisticDisplay() {
    TrackScriptActiveRuntime();

    // Only update statistics every 2 seconds, it does not need to be realtime
    UniCore.LimitActionFrequency("UPDATE_STATISTIC", 2000, () => {
        // Update the runtime display
        const padZero = (num: number) => ((num < 10 ? '0' : '') + num.toFixed(0));
        ConfigOption.Statistics.Runtime.SetValue(`${padZero(State.RuntimeTracking.totalHours)}:${padZero(State.RuntimeTracking.totalMinutes % 60)}:${padZero(State.RuntimeTracking.totalSeconds % 60)}`);

        // Check how many of each berry we currently have in inventory.
        const currentBerryCounts = {
            Cloudberry: FindInventoryItem(ITEMID_CLOUDBERRY).totalCount,
            Lightberry: FindInventoryItem(ITEMID_LIGHTBERRY).totalCount,
            Exoberry: FindInventoryItem(ITEMID_EXOBERRY).totalCount,
        };

        // Initialize the counts that we start out with in order to not count them in statistics.
        if (!State.Statistics.initialized) {
            State.Statistics.InitialBerryCounts = currentBerryCounts;
            State.Statistics.initialized = true;
        }

        // Update the berry collection stats
        for (const berryType of Object.keys(currentBerryCounts) as (keyof typeof currentBerryCounts)[]) {
            const totalGainedBerries = currentBerryCounts[berryType] - State.Statistics.InitialBerryCounts[berryType];
            const gainedBerriesPerHour = totalGainedBerries / Math.max(1, State.RuntimeTracking.totalHours);
            ConfigOption.Statistics.CollectCounts[berryType].SetValue(`${State.Statistics.InitialBerryCounts[berryType]} + ${totalGainedBerries} (${gainedBerriesPerHour}/hour)`);
        }

        // Update the berry bush radar stats (show how many nearby)
        const bushes = FindNearbyBerryBushes();
        for (const berryType of Object.keys(currentBerryCounts) as (keyof typeof currentBerryCounts)[]) {
            ConfigOption.Statistics.NearbyCounts[berryType].SetValue(`${bushes.counts[berryType]}`);
        }
    });
}

/**
 * We will be working with movement in this script,
 * to make lives easier for us we can create a little helper
 * function that keeps track of weither or not we are already
 * traveling to a certain position or if it would be better
 * to start a new navigation.
 */
function SetNavigationTarget(targetPosition: IVector3, skipPathfind: boolean = false) {
    State.Navigation.noNavigationThisTick = false;
    const minTargetPositionAccuracy = skipPathfind ? 0.5 : 1.5;

    if (UniNavigation.IsNavigating() && UniCore.GetDistanceV3(targetPosition, State.Navigation.currentNavigationTarget) < minTargetPositionAccuracy) {
        // The navigation that is currently active is sufficiently close to targetPosition
        return;
    }

    // We should start a new navigation
    UniNavigation.NavigateTo(targetPosition, skipPathfind, () => State.Navigation.onAbortTick());
    State.Navigation.currentNavigationTarget = targetPosition;
}

/**
 * Helper function to easially search and count usable items in inventory.
 * @param itemID 
 * @returns 
 */
function FindInventoryItem(itemID: number) {
    const itemStacks = (UniCore.GetCurrentPlayer().get("inventory") as IPlayer["inventory"]).filter(x => x.itemID == itemID);
    const totalCount = itemStacks.reduce((accumulator, currentValue) => accumulator + currentValue.quantity, 0);

    return {
        itemStacks,
        totalCount
    };
}

/**
 * Helper function that tells us weither or not we are currently wearing the bestGloves item.
 */
function IsWearingBestGloves(bestGloves: InventoryItem) {
    const currentEquippedWeapon = (UniCore.GetCurrentPlayer()
        .get("equips") as IPlayer["equips"])
        .find(x => x.slot == PLAYER_EQUIP_SLOT.PRIMARY_WEAPON);
    return (currentEquippedWeapon &&
        currentEquippedWeapon.itemID == bestGloves.itemID &&
        currentEquippedWeapon.upgradeCount == bestGloves.upgradeCount);
}

/**
 * Returns the type of berry for the provided berry bush.
 */
function GetBerryType(berryBush: Material) {
    if (berryBush.gamePropID == MOVERID_CLOUDBERRY_BUSH) {
        return "Cloudberry";
    }

    if (berryBush.gamePropID == MOVERID_LIGHTBERRY_BUSH) {
        return "Lightberry";
    }

    if (berryBush.gamePropID == MOVERID_EXOBERRY_BUSH) {
        return "Exoberry";
    }
}

/**
 * Helper function to easially fetch relevant and count all nearby berry bushes.
 */
function FindNearbyBerryBushes() {
    const materialsNearby = UniCore.GetNearbyMaterials();
    const berryBushesNearby: Material[] = [];
    const counts = {
        Cloudberry: 0,
        Lightberry: 0,
        Exoberry: 0
    };

    for (const currentMaterial of materialsNearby) {
        const berryType = GetBerryType(currentMaterial);

        if (berryType == undefined) {
            UniCore.LogDespammed("Encountered unexpected berry with gamePropID = " + currentMaterial.gamePropID);
            continue;
        }

        // Increment the counter for current berryType
        counts[berryType]++;

        // Add the bush to our list if it is configured to be collected
        if (ConfigOption.Collect[berryType].GetValue())
            berryBushesNearby.push(currentMaterial);
    }

    return {
        counts,
        list: berryBushesNearby
    };
}

function GetBestAvailableHarvestingGloves() {
    const inventoryGloves = UniCore.GetCurrentPlayer().Inventory.Items.filter((x: InventoryItem) => x.itemID == ITEMID_HARVESTING_GLOVES);
    const equippedGloves = UniCore.GetCurrentPlayer().Inventory.Items.filter((x: InventoryItem) => x.itemID == ITEMID_HARVESTING_GLOVES);

    const bestGloves = [...inventoryGloves, ...equippedGloves].sort((a, b) => b.upgradeCount - a.upgradeCount)?.at(0);

    if (!bestGloves && !ConfigOption.Extra.PurchaseGloves.GetValue()) {
        throw new Error("Player does not own \"Harvesting Gloves\" and \"Purchase Gloves\" option is disabled.");
    }

    return bestGloves;
}
