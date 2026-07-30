const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const viewport = $("#worldViewport");
const stage = $("#environmentStage");
const labelLayer = $("#mapLabels");
const routeOverlay = $("#routeOverlay");
const activeRoutePath = $("#activeRoutePath");
const activeRouteShadow = $("#activeRouteShadow");
const routeVehicle = $("#routeVehicle");
const routeVehicleArtwork = $("#routeVehicleArtwork");
const routeDestinationPin = $("#routeDestinationPin");
const vehicleImageUrl = new URL("../assets/neighborhood/c300-studio-front-v1.png", import.meta.url).href;

const destinations = {
  garage: {
    label: "SimpleRides Garage",
    title: "SimpleRides Garage",
    kicker: "Fleet & vehicle access",
    status: "Available now",
    name: "2017 Mercedes-Benz C300",
    description: "The selected premium weekly-access vehicle. Final access follows verification and owner approval.",
    facts: [["Status", "Available"], ["Access", "Weekly · Austin, TX"]],
    icon: "car",
    primary: ["View Fleet", "../#fleet"],
    secondary: ["Verify to Drive", "../#apply"],
    position: [45, 47],
    focus: [-1.5, 1, 1.095],
    route: { start: "garage", goal: "garage" },
    vehicle: true
  },
  verify: {
    label: "Verification Center",
    title: "Verification Center",
    kicker: "Application & readiness",
    status: "Ready for intake",
    name: "Your path to the keys",
    description: "Contact, identity, payment-name match, consent, planned use, and owner review live here.",
    facts: [["Flow", "Apply → Review → Approve"], ["Privacy", "Owner-reviewed"]],
    icon: "verify",
    primary: ["Start Verification", "../#apply"],
    secondary: ["Read the Rules", "../#rules"],
    position: [19, 58],
    focus: [3, -1.5, 1.11],
    route: { start: "garage", goal: "verify" }
  },
  rewards: {
    label: "Road Rewards",
    title: "Road Rewards",
    kicker: "GPS mileage & SRC progress",
    status: "Launch-gated",
    name: "Mileage Mining route",
    description: "The route represents opted-in trips, trusted GPS quality, pending SRC, checkpoints, and trip history.",
    facts: [["Tracking", "Only while opted in"], ["Launch", "Physical GPS QA required"]],
    icon: "route",
    primary: ["Open Go Live", "../#mileage"],
    secondary: ["Review Rewards", "../#src-live"],
    position: [51, 23],
    focus: [-.5, 2.8, 1.1],
    route: { start: "garage", goal: "rewards" }
  },
  marketplace: {
    label: "SRC Marketplace",
    title: "SRC Marketplace",
    kicker: "Wallet, checkout & utility",
    status: "Beta controlled",
    name: "SimpleRides Marketplace",
    description: "Wallet identity, SRC utility, vehicle checkout previews, loyalty eligibility, and owner-controlled offers meet here.",
    facts: [["Utility", "Rewards & app access"], ["Approval", "Always required"]],
    icon: "market",
    primary: ["Open Marketplace", "../#marketplace"],
    secondary: ["Open Wallet", "../#home"],
    position: [68, 58],
    focus: [-3.2, -1.4, 1.105],
    route: { start: "garage", goal: "marketplace" }
  },
  owner: {
    label: "Owner Operations",
    title: "Owner Operations",
    kicker: "Review & lifecycle control",
    status: "Admin access",
    name: "The business control room",
    description: "Leads, owner review, approvals, reservations, active rentals, returns, fleet state, audits, and launch gates live here.",
    facts: [["Lifecycle", "New → Closed"], ["Authority", "Owner & trusted admin"]],
    icon: "owner",
    primary: ["Owner Dashboard", "../#dashboard"],
    secondary: ["Fleet Status", "../#fleet"],
    position: [69, 34],
    focus: [-3.2, 2, 1.105],
    route: { start: "garage", goal: "owner" }
  },
  drivers: {
    label: "Driver Homes",
    title: "Driver Homes",
    kicker: "Accounts & applications",
    status: "Neighborhood members",
    name: "Every driver has a place",
    description: "Profiles, application progress, rental status, trust, referrals, and the Digital Garage begin here.",
    facts: [["Account", "Guest or signed in"], ["Progress", "Saved locally & securely"]],
    icon: "home",
    primary: ["Open Account", "../#home"],
    secondary: ["Apply", "../#apply"],
    position: [27, 30],
    focus: [2.5, 2.2, 1.105],
    route: { start: "garage", goal: "drivers" }
  },
  baymax: {
    label: "BayMax Help Point",
    title: "BayMax Help Point",
    kicker: "Step-by-step guidance",
    status: "Guide ready",
    name: "Ask what to do next",
    description: "BayMax translates every SimpleRides feature into clear steps and points you to the right place.",
    facts: [["Style", "Simple, calm guidance"], ["Coverage", "Drivers & owners"]],
    icon: "help",
    primary: ["Meet BayMax", "../#fleet"],
    secondary: ["View Rules", "../#rules"],
    position: [48, 78],
    focus: [0, -3, 1.1],
    route: { start: "garage", goal: "baymax" }
  }
};

// Every navigation route is constrained to this traced roadway graph.
// Coordinates map directly to the 1536 × 1024 cinematic neighborhood plate.
const roadNodes = {
  garage: [790, 590],
  garageDrive: [748, 612],
  garageApproach: [705, 640],
  garageWest: [665, 670],
  central: [620, 697],

  verifyApproach: [575, 718],
  verifyCurve: [525, 735],
  verify: [480, 730],

  driverSouth: [565, 690],
  driverLotSouth: [520, 675],
  driverMid: [480, 650],
  driverNorth: [455, 610],
  driverTurn: [440, 565],
  driverExit: [445, 520],
  driverRoad: [485, 485],
  drivers: [540, 455],

  baymaxApproach: [625, 742],
  baymax: [655, 775],

  marketTurn: [830, 612],
  marketLaneNorth: [865, 642],
  marketLaneMid: [892, 682],
  marketLaneSouth: [910, 728],
  marketCurve: [930, 770],
  marketWest: [960, 805],
  marketFront: [1000, 826],
  marketplace: [1045, 832],

  eastDrive: [838, 574],
  eastRoad: [890, 554],
  ownerWest: [945, 538],
  ownerCenter: [1005, 526],
  ownerEast: [1065, 515],
  ownerApproach: [1125, 510],
  owner: [1175, 515],

  rewardWest: [610, 430],
  rewardMainWest: [670, 405],
  rewardMain: [730, 380],
  rewardCurve: [780, 352],
  rewardApproach: [820, 336],
  rewards: [860, 328]
};

const roadEdges = [
  ["central", "garageWest"], ["garageWest", "garageApproach"],
  ["garageApproach", "garageDrive"], ["garageDrive", "garage"],

  ["central", "verifyApproach"], ["verifyApproach", "verifyCurve"],
  ["verifyCurve", "verify"],

  ["central", "driverSouth"], ["driverSouth", "driverLotSouth"],
  ["driverLotSouth", "driverMid"], ["driverMid", "driverNorth"],
  ["driverNorth", "driverTurn"], ["driverTurn", "driverExit"],
  ["driverExit", "driverRoad"], ["driverRoad", "drivers"],

  ["central", "baymaxApproach"], ["baymaxApproach", "baymax"],

  ["garage", "marketTurn"], ["marketTurn", "marketLaneNorth"],
  ["marketLaneNorth", "marketLaneMid"], ["marketLaneMid", "marketLaneSouth"],
  ["marketLaneSouth", "marketCurve"], ["marketCurve", "marketWest"],
  ["marketWest", "marketFront"], ["marketFront", "marketplace"],

  ["garage", "eastDrive"], ["eastDrive", "eastRoad"], ["eastRoad", "ownerWest"],
  ["ownerWest", "ownerCenter"], ["ownerCenter", "ownerEast"],
  ["ownerEast", "ownerApproach"], ["ownerApproach", "owner"],

  ["drivers", "rewardWest"], ["rewardWest", "rewardMainWest"],
  ["rewardMainWest", "rewardMain"], ["rewardMain", "rewardCurve"],
  ["rewardCurve", "rewardApproach"],
  ["rewardApproach", "rewards"]
];

// These are deliberate driving lanes, not generated or randomized routes.
// Every sequence starts at the garage and follows the traced road centerline.
const roadRoutePlans = Object.freeze({
  garage: Object.freeze(["garage"]),
  verify: Object.freeze([
    "garage", "garageDrive", "garageApproach", "garageWest", "central",
    "verifyApproach", "verifyCurve", "verify"
  ]),
  drivers: Object.freeze([
    "garage", "garageDrive", "garageApproach", "garageWest", "central",
    "driverSouth", "driverLotSouth", "driverMid", "driverNorth", "driverTurn",
    "driverExit", "driverRoad", "drivers"
  ]),
  baymax: Object.freeze([
    "garage", "garageDrive", "garageApproach", "garageWest", "central",
    "baymaxApproach", "baymax"
  ]),
  marketplace: Object.freeze([
    "garage", "marketTurn", "marketLaneNorth", "marketLaneMid", "marketLaneSouth",
    "marketCurve", "marketWest", "marketFront", "marketplace"
  ]),
  owner: Object.freeze([
    "garage", "eastDrive", "eastRoad", "ownerWest", "ownerCenter", "ownerEast",
    "ownerApproach", "owner"
  ]),
  rewards: Object.freeze([
    "garage", "garageDrive", "garageApproach", "garageWest", "central",
    "driverSouth", "driverLotSouth", "driverMid", "driverNorth", "driverTurn",
    "driverExit", "driverRoad", "drivers", "rewardWest", "rewardMainWest",
    "rewardMain", "rewardCurve", "rewardApproach", "rewards"
  ])
});

// Stationary poses share the background's 1536 × 1024 coordinate system.
// The source Mercedes artwork faces right, so heading 0 points along +X.
const vehicleParkingStates = Object.freeze({
  garage: Object.freeze({ x: 790, y: 590, heading: -27.65, scale: .7 }),
  verification: Object.freeze({ x: 480, y: 730, heading: -173.66, scale: .68 }),
  rewards: Object.freeze({ x: 860, y: 328, heading: -11.31, scale: .62 }),
  marketplace: Object.freeze({ x: 1045, y: 832, heading: 7.59, scale: .7 }),
  owner: Object.freeze({ x: 1175, y: 515, heading: 5.71, scale: .66 }),
  drivers: Object.freeze({ x: 540, y: 455, heading: -28.61, scale: .64 }),
  baymax: Object.freeze({ x: 655, y: 775, heading: 47.73, scale: .7 })
});

const destinationParkingKeys = Object.freeze({
  garage: "garage",
  verify: "verification",
  rewards: "rewards",
  marketplace: "marketplace",
  owner: "owner",
  drivers: "drivers",
  baymax: "baymax"
});

const roadGraph = Object.fromEntries(Object.keys(roadNodes).map((id) => [id, []]));
roadEdges.forEach(([from, to]) => {
  const [fromX, fromY] = roadNodes[from];
  const [toX, toY] = roadNodes[to];
  const distance = Math.hypot(toX - fromX, toY - fromY);
  roadGraph[from].push({ id: to, distance });
  roadGraph[to].push({ id: from, distance });
});

function findRoadPath(start, goal) {
  const distances = Object.fromEntries(Object.keys(roadNodes).map((id) => [id, Infinity]));
  const previous = {};
  const unvisited = new Set(Object.keys(roadNodes));
  distances[start] = 0;

  while (unvisited.size) {
    let current = null;
    unvisited.forEach((id) => {
      if (current === null || distances[id] < distances[current]) current = id;
    });
    if (current === goal || distances[current] === Infinity) break;
    unvisited.delete(current);
    roadGraph[current].forEach(({ id, distance }) => {
      if (!unvisited.has(id)) return;
      const candidate = distances[current] + distance;
      if (candidate < distances[id]) {
        distances[id] = candidate;
        previous[id] = current;
      }
    });
  }

  const path = [];
  let cursor = goal;
  while (cursor) {
    path.unshift(cursor);
    if (cursor === start) return path;
    cursor = previous[cursor];
  }
  return [];
}

function roadPathData(nodeIds) {
  const points = nodeIds.map((id) => roadNodes[id]);
  if (points.length < 3) {
    return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  }

  const commands = [`M${points[0][0]} ${points[0][1]}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const incomingLength = Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    const outgoingLength = Math.hypot(next[0] - current[0], next[1] - current[1]);
    const radius = Math.min(12, incomingLength * .24, outgoingLength * .24);
    const entry = [
      current[0] - ((current[0] - previous[0]) / incomingLength) * radius,
      current[1] - ((current[1] - previous[1]) / incomingLength) * radius
    ];
    const exit = [
      current[0] + ((next[0] - current[0]) / outgoingLength) * radius,
      current[1] + ((next[1] - current[1]) / outgoingLength) * radius
    ];
    commands.push(
      `L${entry[0].toFixed(2)} ${entry[1].toFixed(2)}`,
      `Q${current[0]} ${current[1]} ${exit[0].toFixed(2)} ${exit[1].toFixed(2)}`
    );
  }
  commands.push(`L${points[points.length - 1][0]} ${points[points.length - 1][1]}`);
  return commands.join(" ");
}

const labelElements = new Map();
let selected = "garage";
let viewMode = "cinematic";
let scene = { x: 0, y: 0, zoom: 1.04 };
let dragStart = null;
let hintTimer = null;
let driveFrame = null;
let driveRunId = 0;

const MAX_DRIVE_SPEED = 92;
const MIN_TURN_SPEED = 43;
const DRIVE_ACCELERATION = 54;
const DRIVE_BRAKING = 82;
const HEADING_SAMPLE_DISTANCE = 7;
const CURVE_LOOKAHEAD_DISTANCE = 42;
const PIN_LEAD_DISTANCE = 48;

function parkingStateFor(id) {
  return vehicleParkingStates[destinationParkingKeys[id] || id] || vehicleParkingStates.garage;
}

function normalizeHeading(heading) {
  return ((heading + 180) % 360 + 360) % 360 - 180;
}

function cameraStableOrientation(heading) {
  const roadHeading = normalizeHeading(heading);
  if (roadHeading > 90) {
    return { roadHeading, visualHeading: roadHeading - 180, facing: -1 };
  }
  if (roadHeading < -90) {
    return { roadHeading, visualHeading: roadHeading + 180, facing: -1 };
  }
  return { roadHeading, visualHeading: roadHeading, facing: 1 };
}

function setVehiclePose({ x, y, heading, scale = 1 }, state = "parked") {
  const orientation = cameraStableOrientation(heading);
  routeVehicle.setAttribute(
    "transform",
    `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${orientation.visualHeading.toFixed(2)}) scale(${scale.toFixed(3)})`
  );
  routeVehicleArtwork.setAttribute("transform", `scale(${orientation.facing} 1)`);
  routeVehicle.dataset.state = state;
  routeVehicle.dataset.x = x.toFixed(2);
  routeVehicle.dataset.y = y.toFixed(2);
  routeVehicle.dataset.heading = orientation.roadHeading.toFixed(2);
  routeVehicle.dataset.visualHeading = orientation.visualHeading.toFixed(2);
  routeVehicle.dataset.facing = orientation.facing === 1 ? "right" : "left";
  routeVehicle.dataset.scale = scale.toFixed(3);
}

function shortestAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function segmentHeading(from, to) {
  return Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;
}

function pathHeadingAt(path, distance, totalLength) {
  const behind = path.getPointAtLength(Math.max(0, distance - HEADING_SAMPLE_DISTANCE));
  const ahead = path.getPointAtLength(Math.min(totalLength, distance + HEADING_SAMPLE_DISTANCE));
  return Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180 / Math.PI;
}

function targetSpeedAt(path, distance, totalLength, currentHeading) {
  const remaining = Math.max(0, totalLength - distance);
  const lookaheadHeading = pathHeadingAt(
    path,
    Math.min(totalLength, distance + CURVE_LOOKAHEAD_DISTANCE),
    totalLength
  );
  const turnAmount = Math.abs(shortestAngleDelta(currentHeading, lookaheadHeading));
  const turnSpeed = Math.max(
    MIN_TURN_SPEED,
    MAX_DRIVE_SPEED * (1 - Math.min(.5, turnAmount / 120))
  );
  const brakingSpeed = Math.sqrt(2 * DRIVE_BRAKING * remaining);
  return Math.min(turnSpeed, brakingSpeed);
}

function cancelActiveDrive() {
  driveRunId += 1;
  if (driveFrame !== null) {
    window.cancelAnimationFrame(driveFrame);
    driveFrame = null;
  }
  routeOverlay.classList.remove("is-driving");
}

function positionDestinationPin(endpoint, heading) {
  const radians = heading * Math.PI / 180;
  const x = endpoint[0] + Math.cos(radians) * PIN_LEAD_DISTANCE;
  const y = endpoint[1] + Math.sin(radians) * PIN_LEAD_DISTANCE;
  routeDestinationPin.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
}

function setScene(x = scene.x, y = scene.y, zoom = scene.zoom, exploring = false) {
  scene = {
    x: Math.max(-4.5, Math.min(4.5, x)),
    y: Math.max(-3.5, Math.min(3.5, y)),
    zoom: Math.max(1, Math.min(1.17, zoom))
  };
  stage.classList.toggle("is-exploring", exploring);
  stage.style.setProperty("--scene-x", `${scene.x}%`);
  stage.style.setProperty("--scene-y", `${scene.y}%`);
  stage.style.setProperty("--scene-zoom", scene.zoom.toFixed(3));
}

function makeLabels() {
  Object.entries(destinations).forEach(([id, destination]) => {
    const wrapper = document.createElement("div");
    wrapper.className = "map-label";
    wrapper.style.left = `${destination.position[0]}%`;
    wrapper.style.top = `${destination.position[1]}%`;
    wrapper.innerHTML = `
      <button type="button" data-destination="${id}" aria-label="Open ${destination.label}">
        <svg><use href="#icon-${destination.icon}"></use></svg>
        <strong>${destination.label}</strong>
        <i></i>
      </button>`;
    labelLayer.appendChild(wrapper);
    labelElements.set(id, wrapper);
  });
}

function loadIdentity() {
  let name = "Guest Driver";
  try {
    const saved = localStorage.getItem("simpleRidesCurrentUserV2") || localStorage.getItem("simpleRidesCurrentUser");
    const session = saved ? JSON.parse(saved) : null;
    name = session?.username || session?.name || name;
  } catch {
    // An anonymous neighborhood still works if local account data is malformed.
  }
  $("#identityName").textContent = name;
  $("#identityAvatar").textContent = name.trim().charAt(0).toUpperCase() || "G";
}

function scheduleHintHide(delay = 3200) {
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => {
    $("#worldHint").style.opacity = "0";
  }, delay);
}

function clearNavigationRoute() {
  cancelActiveDrive();
  routeOverlay.classList.remove("is-active");
  routeOverlay.classList.remove("is-arrived");
  routeOverlay.removeAttribute("data-destination");
  routeOverlay.removeAttribute("data-road-nodes");
  routeOverlay.removeAttribute("data-drive-seconds");
  routeOverlay.removeAttribute("data-drive-progress");
  activeRoutePath.setAttribute("d", "");
  activeRouteShadow.setAttribute("d", "");
  setVehiclePose(vehicleParkingStates.garage);
  $("#worldHint").textContent = "Move to look around · Scroll to zoom · Select a destination";
}

function showNavigationRoute(id) {
  const data = destinations[id];
  if (!data?.route) return;
  const nodePath = roadRoutePlans[id] || findRoadPath(data.route.start, data.route.goal);
  if (!nodePath.length) {
    clearNavigationRoute();
    return;
  }
  if (nodePath.length === 1) {
    clearNavigationRoute();
    $("#worldHint").textContent = `${data.label} · Mercedes parked here`;
    $("#worldHint").style.opacity = "1";
    scheduleHintHide();
    return;
  }
  const d = roadPathData(nodePath);
  const destination = roadNodes[nodePath[nodePath.length - 1]];
  cancelActiveDrive();
  const runId = driveRunId;

  // A trip always departs from the garage. Clearing the parked transform first
  // prevents it from ever being composed with the frame-driven transform.
  routeVehicle.removeAttribute("transform");
  activeRoutePath.setAttribute("d", d);
  activeRouteShadow.setAttribute("d", d);
  const routeLength = activeRoutePath.getTotalLength();
  const estimatedDriveSeconds = routeLength / (MAX_DRIVE_SPEED * .76);
  const finalFrom = roadNodes[nodePath[nodePath.length - 2]];
  const finalHeading = segmentHeading(finalFrom, destination);
  positionDestinationPin(destination, finalHeading);
  routeOverlay.dataset.destination = id;
  routeOverlay.dataset.roadNodes = String(nodePath.length);
  routeOverlay.dataset.driveSeconds = estimatedDriveSeconds.toFixed(2);
  routeOverlay.dataset.driveProgress = "0.0000";
  routeOverlay.dataset.routeMode = "explicit-centerline";
  routeOverlay.classList.remove("is-arrived");
  routeOverlay.classList.add("is-driving");
  routeOverlay.classList.add("is-active");
  const revealDetailsAfterDrive = window.innerWidth <= 820;
  if (revealDetailsAfterDrive) {
    $("#detailPanel").classList.add("is-closed");
    window.requestAnimationFrame(syncMobileControls);
  }
  $("#worldHint").textContent = `Mercedes en route to ${data.label}`;
  $("#worldHint").style.opacity = "1";

  const startHeading = pathHeadingAt(activeRoutePath, 0, routeLength);
  const garageScale = vehicleParkingStates.garage.scale;
  const destinationScale = parkingStateFor(id).scale;
  const startPoint = activeRoutePath.getPointAtLength(0);
  let distanceTraveled = 0;
  let currentSpeed = 0;
  let previousTimestamp = null;
  setVehiclePose(
    { x: startPoint.x, y: startPoint.y, heading: startHeading, scale: garageScale },
    "driving"
  );
  routeVehicle.dataset.speed = "0.00";
  routeVehicle.dataset.steering = "0.00";
  routeVehicle.dataset.centerlineError = "0.00";

  function drive(timestamp) {
    if (runId !== driveRunId) return;
    const frameSeconds = previousTimestamp === null
      ? 1 / 60
      : Math.min(.05, Math.max(.001, (timestamp - previousTimestamp) / 1000));
    previousTimestamp = timestamp;

    const heading = pathHeadingAt(activeRoutePath, distanceTraveled, routeLength);
    const desiredSpeed = targetSpeedAt(activeRoutePath, distanceTraveled, routeLength, heading);
    const speedChangeLimit = (
      desiredSpeed >= currentSpeed ? DRIVE_ACCELERATION : DRIVE_BRAKING
    ) * frameSeconds;
    currentSpeed += Math.max(
      -speedChangeLimit,
      Math.min(speedChangeLimit, desiredSpeed - currentSpeed)
    );
    distanceTraveled = Math.min(routeLength, distanceTraveled + currentSpeed * frameSeconds);

    const point = activeRoutePath.getPointAtLength(distanceTraveled);
    const exactHeading = pathHeadingAt(activeRoutePath, distanceTraveled, routeLength);
    const aheadHeading = pathHeadingAt(
      activeRoutePath,
      Math.min(routeLength, distanceTraveled + CURVE_LOOKAHEAD_DISTANCE),
      routeLength
    );
    const steering = shortestAngleDelta(exactHeading, aheadHeading);
    const progress = Math.max(0, Math.min(1, distanceTraveled / routeLength));
    const perspectiveScale = garageScale + (destinationScale - garageScale) * progress;

    setVehiclePose(
      { x: point.x, y: point.y, heading: exactHeading, scale: perspectiveScale },
      "driving"
    );
    routeVehicle.dataset.speed = currentSpeed.toFixed(2);
    routeVehicle.dataset.steering = steering.toFixed(2);
    routeVehicle.dataset.centerlineError = "0.00";
    routeOverlay.dataset.driveProgress = progress.toFixed(4);

    if (routeLength - distanceTraveled > 1 || currentSpeed > 13) {
      driveFrame = window.requestAnimationFrame(drive);
      return;
    }

    driveFrame = null;
    const parked = parkingStateFor(id);
    setVehiclePose(
      { x: parked.x, y: parked.y, heading: finalHeading, scale: parked.scale },
      "parked"
    );
    routeVehicle.dataset.speed = "0.00";
    routeVehicle.dataset.steering = "0.00";
    routeVehicle.dataset.centerlineError = "0.00";
    routeOverlay.dataset.driveProgress = "1.0000";
    routeOverlay.classList.remove("is-driving");
    routeOverlay.classList.add("is-arrived");
    if (revealDetailsAfterDrive) {
      $("#detailPanel").classList.remove("is-closed");
      window.requestAnimationFrame(syncMobileControls);
    }
    $("#worldHint").textContent = `Mercedes arrived at ${data.label}`;
    $("#worldHint").style.opacity = "1";
    scheduleHintHide(2600);
  }

  driveFrame = window.requestAnimationFrame(drive);
}

function actionMarkup([label, href]) {
  return { label, href };
}

function focusDestination(id) {
  const [x, y, zoom] = destinations[id].focus;
  viewMode = "cinematic";
  setScene(x, y, zoom);
}

function updateSelectionChrome(id, sourceButton) {
  $$(".dock-button").forEach((button) => {
    const active = button.dataset.destination === id;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const railButtons = $$(".rail-button[data-destination]");
  railButtons.forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  });
  const activeRail = sourceButton?.classList.contains("rail-button")
    ? sourceButton
    : $(".rail-button[data-destination='garage']");
  activeRail?.classList.add("active");
  activeRail?.setAttribute("aria-pressed", "true");

  labelElements.forEach((element, key) => {
    const active = key === id;
    element.classList.toggle("is-selected", active);
    element.querySelector("button")?.setAttribute("aria-pressed", String(active));
  });
}

function syncMobileControls() {
  if (window.innerWidth > 820) {
    viewport.style.removeProperty("--mobile-controls-bottom");
    return;
  }
  const panel = $("#detailPanel");
  if (panel.classList.contains("is-closed")) {
    viewport.style.setProperty("--mobile-controls-bottom", "86px");
    return;
  }
  const viewportRect = viewport.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const bottom = Math.max(86, viewportRect.bottom - panelRect.top + 12);
  viewport.style.setProperty("--mobile-controls-bottom", `${Math.round(bottom)}px`);
}

function renderDetails(id, shouldFocus = true, sourceButton = null) {
  const data = destinations[id];
  if (!data) return;
  selected = id;
  stage.dataset.selected = id;

  $("#detailTitle").textContent = data.title;
  $("#detailKicker").textContent = data.kicker;
  $("#detailStatus").textContent = data.status;
  $("#detailName").textContent = data.name;
  $("#detailDescription").textContent = data.description;
  $("#detailIcon").innerHTML = `<svg><use href="#icon-${data.icon}"></use></svg>`;
  $("#detailFacts").innerHTML = data.facts
    .map(([term, definition]) => `<div><dt>${term}</dt><dd>${definition}</dd></div>`)
    .join("");

  const preview = $("#vehiclePreview");
  preview.classList.toggle("is-symbol", !data.vehicle);
  preview.innerHTML = data.vehicle
    ? `<img src="${vehicleImageUrl}" alt="White 2017 Mercedes-Benz C300">`
    : `<svg aria-hidden="true"><use href="#icon-${data.icon}"></use></svg>`;

  const primary = actionMarkup(data.primary);
  const secondary = actionMarkup(data.secondary);
  $("#primaryAction").href = primary.href;
  $("#primaryAction").innerHTML = `${primary.label} <svg><use href="#icon-chevron"></use></svg>`;
  $("#secondaryAction").href = secondary.href;
  $("#secondaryAction").innerHTML = `${secondary.label} <svg><use href="#icon-chevron"></use></svg>`;

  $("#detailPanel").classList.remove("is-closed");
  updateSelectionChrome(id, sourceButton);
  window.requestAnimationFrame(syncMobileControls);
  if (shouldFocus) {
    focusDestination(id);
    showNavigationRoute(id);
  } else {
    clearNavigationRoute();
  }
}

function resetView() {
  viewMode = "cinematic";
  setScene(0, 0, 1.04);
  clearNavigationRoute();
  $(".side-rail").classList.remove("is-open");
}

function toggleView() {
  if (viewMode === "overview") {
    focusDestination(selected);
  } else {
    viewMode = "overview";
    setScene(0, 0, 1);
  }
}

makeLabels();
loadIdentity();

document.addEventListener("click", (event) => {
  const destinationButton = event.target.closest("[data-destination]");
  if (destinationButton) {
    renderDetails(destinationButton.dataset.destination, true, destinationButton);
    if (window.innerWidth <= 820) $(".side-rail").classList.remove("is-open");
  }
});

$("#closePanel").addEventListener("click", () => {
  $("#detailPanel").classList.add("is-closed");
  window.requestAnimationFrame(syncMobileControls);
});
$("#focusSelected").addEventListener("click", () => {
  focusDestination(selected);
  showNavigationRoute(selected);
});
$("#zoomIn").addEventListener("click", () => setScene(scene.x, scene.y, scene.zoom + .035));
$("#zoomOut").addEventListener("click", () => setScene(scene.x, scene.y, scene.zoom - .035));
$("#toggleView").addEventListener("click", toggleView);
$("#resetView").addEventListener("click", resetView);
$("#exploreButton").addEventListener("click", () => {
  $("#detailPanel").classList.add("is-closed");
  viewMode = "overview";
  setScene(0, 0, 1);
  clearNavigationRoute();
  window.requestAnimationFrame(syncMobileControls);
});
$("#mobileMenu").addEventListener("click", () => $(".side-rail").classList.toggle("is-open"));
window.addEventListener("resize", syncMobileControls);
new ResizeObserver(syncMobileControls).observe($("#detailPanel"));

viewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, a, aside, nav")) return;
  dragStart = { pointerX: event.clientX, pointerY: event.clientY, sceneX: scene.x, sceneY: scene.y };
  viewport.setPointerCapture(event.pointerId);
  stage.classList.add("is-exploring");
  $("#worldHint").style.opacity = "0";
});

viewport.addEventListener("pointermove", (event) => {
  const rect = viewport.getBoundingClientRect();
  if (dragStart) {
    const x = dragStart.sceneX + ((event.clientX - dragStart.pointerX) / rect.width) * 8;
    const y = dragStart.sceneY + ((event.clientY - dragStart.pointerY) / rect.height) * 6;
    setScene(x, y, scene.zoom, true);
    return;
  }
  if (event.pointerType === "mouse" && viewMode === "cinematic") {
    const x = ((event.clientX - rect.left) / rect.width - .5) * -1.25;
    const y = ((event.clientY - rect.top) / rect.height - .5) * -.75;
    setScene(x, y, scene.zoom, true);
  }
});

function endDrag(event) {
  dragStart = null;
  stage.classList.remove("is-exploring");
  if (event?.pointerId != null && viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }
}

viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);
viewport.addEventListener("pointerleave", () => {
  if (!dragStart) stage.classList.remove("is-exploring");
});
viewport.addEventListener("wheel", (event) => {
  if (event.target.closest("aside, nav")) return;
  event.preventDefault();
  setScene(scene.x, scene.y, scene.zoom + (event.deltaY < 0 ? .025 : -.025));
  $("#worldHint").style.opacity = "0";
}, { passive: false });

renderDetails("garage", false);
setScene(0, 0, 1.04);
syncMobileControls();
scheduleHintHide(6500);
