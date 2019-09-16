#!/usr/bin/env node
'use strict';
// var fsExtra = require('fs-extra');
// var yargs = require('yargs');
// var zlib = require('zlib');
// var zlibGunzip = Promise.promisify(zlib.gunzip);
// var zlibGzip = Promise.promisify(zlib.gzip);
// var path = require('path');
// var Promise = require('bluebird');
// var isGzipped = require('../lib/isGzipped');
//
// function readFile(file) {
//     return fsExtra.readFile(file)
//         .then(function(fileBuffer) {
//             if (isGzipped(fileBuffer)) {
//                 return zlibGunzip(fileBuffer);
//             }
//             return fileBuffer;
//         });
// }

// var fs=require('fs-extra');
// var data=fs.readFileSync('words.json', 'utf8');
// var words=JSON.parse(data);

const fs = require('fs-extra');
const path = require('path');

const tilesetJson = fs.readJsonSync('./tileset.json');
const layerJson = fs.readJsonSync('./layer.json');

const headCount = tilesetJson.tilingScheme.headCount;
const type = tilesetJson.tilingScheme.type;
const available = layerJson.available;

// "d/x/y/z" or "d/x/y" keys for the first available tiles
// Add these entries to tilingScheme in the new tileset.json
tilesetJson.tilingScheme.roots = [];

// All subtrees in a tileset must have the same number of levels
const subtreeLevelsMax = 10;
const subtreeLevelsOct = 2;
const subtreeLevelsQuad = 9;

// dim in each dir
// const subtreesLevelDim = [
//     0,          // 0  Levels
//     1,          // 1  Levels
//     2,          // 2  Levels
//     4,          // 3  Levels
//     8,          // 4  Levels
//     16,         // 5  Levels
//     32,         // 6  Levels
//     64,         // 7  Levels
//     128,        // 8  Levels
//     256,        // 9  Levels
//     512         // 10 Levels
// ];

const subtreesPackedUint8ArraySizesQuad = [
    0,          // 0  Levels
    1,          // 1  Levels
    2,          // 2  Levels
    4,          // 3  Levels
    12,         // 4  Levels
    44,         // 5  Levels
    172,        // 6  Levels
    684,        // 7  Levels
    2732,       // 8  Levels
    10924,      // 9  Levels
    43692       // 10 Levels
];

const subtreesPackedUint8ArraySizesOct = [
    0,          // 0  Levels
    1,          // 1  Levels
    2,          // 2  Levels
    10,         // 3  Levels
    74,         // 4  Levels
    586,        // 5  Levels
    4682,       // 6  Levels
    37450,      // 7  Levels
    299594,     // 8  Levels
    2396746,    // 9  Levels
    19173962    // 10 Levels
];

// TODO: What is the zip diff of packs vs unpacked?  If it's significant enough, maybe keep it as packed but unpack into byte array client side
// Quad packed vs unpack subtree efficiency diff is ~1.5 levels
const subtreesUint8ArraySizesQuad = [
    0,          // 0  Levels
    1,          // 1  Levels
    5,          // 2  Levels
    21,         // 3  Levels
    85,         // 4  Levels
    341,        // 5  Levels
    1365,       // 6  Levels
    5461,       // 7  Levels
    21845,      // 8  Levels
    87381,      // 9  Levels
    349525      // 10 Levels
];

// Oct packed vs unpack subtree efficiency diff is 1 level
const subtreesUint8ArraySizesOct = [
    0,          // 0  Levels
    1,          // 1  Levels
    9,          // 2  Levels
    73,         // 3  Levels
    585,        // 4  Levels
    4681,       // 5  Levels
    37449,      // 6  Levels
    299593,     // 7  Levels
    2396745,    // 8  Levels
    19173961,   // 9  Levels
    153391689   // 10 Levels
];


const packed = true;
const arraySizes = type === 'oct' ?
    (packed ? subtreesPackedUint8ArraySizesOct : subtreesUint8ArraySizesOct) :
    (packed ? subtreesPackedUint8ArraySizesQuad : subtreesUint8ArraySizesQuad);

const subtreeLevels = type === 'oct' ? subtreeLevelsOct : subtreeLevelsQuad;
const subtreeLevels0Indexed = subtreeLevels - 1;
const arraySize = arraySizes[subtreeLevels];
tilesetJson.tilingScheme.subtreeLevels = subtreeLevels;


console.log('headCount: ' + headCount); console.log();
console.log('type: ' + type); console.log();
console.log('available: '); console.log(available); console.log();
console.log('subtreeLevels: ' + tilesetJson.tilingScheme.subtreeLevels); console.log();

// Verify total tree levels, had a layer.json with empty levels near the end
let totalTreeLevels = -1;
for (let i = 0; i < available.length; i++) {
    if (available[i].length > 0) {
        totalTreeLevels = i + 1;
    }
}

const subtreesToSpanTree = Math.ceil(totalTreeLevels / subtreeLevels);
console.log('total tree levels: ' + totalTreeLevels); console.log();
console.log('subtreesToSpanTree: ' + subtreesToSpanTree); console.log();

// const dimsPerLevel = [];
// for (let i = 0; i < totalTreeLevels; i++) {
//     const x = (1 << i) * headCount[0];
//     const y = (1 << i) * headCount[1];
//     const z = (1 << i) * headCount[2];
//     dimsPerLevel[i] = [x, y, z];
//     console.log('dimsPerLevel ' + i + ' : ' + dimsPerLevel[i]);
// }

const treeInfo = {
    map: new Map(),
    type: type,
    headCount: headCount,
    subtreeLevels: subtreeLevels,
    subtreeLevels0Indexed: subtreeLevels0Indexed,
    arraySizes: arraySizes,
    arraySize: arraySize,
    totalTreeLevels: totalTreeLevels,
    firstLevel: -1,
    tilesetJson: tilesetJson,
    // dimsPerLevel: dimsPerLevel,
};

const updateFunction = type === 'oct' ?
    (packed ? updatePackedSubtreesMapOct : updateSubtreesMapOct) :
    (packed ? updatePackedSubtreesMapQuad : updateSubtreesMapQuad);
for (let subtreesDownTree = 0; subtreesDownTree < subtreesToSpanTree; subtreesDownTree++) {
    const firstSubtreeLevel = subtreesDownTree*subtreeLevels0Indexed;
    const lastSubtreeLevel = firstSubtreeLevel + subtreeLevels0Indexed;
    console.log('computing subtrees on levels ' + firstSubtreeLevel + ' through ' + lastSubtreeLevel);
    for (let subtreeLevel = 0; subtreeLevel < subtreeLevels; subtreeLevel++) {
        const treeLevel = firstSubtreeLevel + subtreeLevel;

        if (treeLevel > totalTreeLevels - 1) {
            break; // Done
        }

        const ranges = available[treeLevel];
        if (ranges.length !== 0 && treeInfo.firstLevel === -1) {
            treeInfo.firstLevel = treeLevel;
            console.log('First Level: ' + treeInfo.firstLevel);
        }
        for (const range of ranges) {
            updateFunction(range, subtreeLevel, subtreesDownTree, treeLevel, treeInfo);
        }
    }
}

const outputFolder = 'Output'
const availabilityFolder = 'availability'
// Write subtrees
const map = treeInfo.map;
for (const [key, value] of map) {
    const filePath = outputFolder + '/' + availabilityFolder + '/' + key;
    fs.outputFileSync(filePath, value, {encoding: 'binary'});
}
// Write tileset.json
const filePath = outputFolder + '/tileset.json';
fs.outputJsonSync(filePath, treeInfo.tilesetJson);


///////////////////
//// FUNCTIONS ////
///////////////////
function updatePackedSubtreesMapOct(range, subtreeLevel, subtreesDownTree, treeLevel, treeInfo) {
    console.log();
    console.log();
    console.log('proccesing range: ');
    console.log(range);
    console.log('on treelevel: ' + treeLevel);
    const map = treeInfo.map;
    const arraySize = treeInfo.arraySize;
    const arraySizes = treeInfo.arraySizes;
    const headCount = treeInfo.headCount;
    const subtreeLevels0Indexed = treeInfo.subtreeLevels0Indexed;

    const subtreeRootLevel = subtreesDownTree * subtreeLevels0Indexed;
    const dimOnLevel = (1 << subtreeLevel);
    const dimOnLevelSqrd = dimOnLevel * dimOnLevel;
    console.log('subtreeLevel: ' + subtreeLevel);
    console.log('subtreeRootLevel: ' + subtreeRootLevel);

    for (let z = range.startZ; z <= range.endZ; z++) {
        for (let y = range.startY; y <= range.endY; y++) {
            for (let x = range.startX; x <= range.endX; x++) {
                // TODO: most of this common to the non-packed version
                // Get the x y z of subtree root key that this range's (treeLevel x y z) resolves to
                const tilesHeadId = {
                    x: (x >> treeLevel),
                    y: (y >> treeLevel),
                    z: (z >> treeLevel),
                };
                console.log();
                console.log('tiles HeadId: ')
                console.log(tilesHeadId);

                // Subtree's root key within the tree
                const subtreeRootKey = {
                    d: subtreeRootLevel,
                    x: x >> subtreeLevel,
                    y: y >> subtreeLevel,
                    z: z >> subtreeLevel,
                };

                const tileKey = treeLevel + '/' + z + '/' + x + '/' + y;
                const key = subtreeRootKey.d + '/' + subtreeRootKey.z + '/' + subtreeRootKey.x + '/' + subtreeRootKey.y;
                console.log('subtree root key: ' + key + '  tile tree key: ' + tileKey);
                if (treeLevel === treeInfo.firstLevel) {
                    // treeInfo.tilesetJson.tilingScheme.roots.push({ d: subtreeRootKey.d, x: subtreeRootKey.x, y: subtreeRootKey.y, z: subtreeRootKey.z });
                    treeInfo.tilesetJson.tilingScheme.roots.push([ subtreeRootKey.d, subtreeRootKey.x, subtreeRootKey.y, subtreeRootKey.z ]);
                }

                // Create an array if doesn't exist. It is 0 inititialized.
                if (!map.has(key)) {
                    map.set(key, new Uint8Array(arraySize));
                }

                // Get the relative key within the subtree for the range's d x y z tree index
                // Get the head in which it lives
                // Amount to subtract off so that we are viewing xyz relative to the head it which it lives
                const shiftX = (subtreeRootKey.x << subtreeLevel);
                const shiftY = (subtreeRootKey.y << subtreeLevel);
                const shiftZ = (subtreeRootKey.z << subtreeLevel);
                // Shift off excess to get tile key within subtree
                const relativeSubtreeKey = {
                    d: subtreeLevel,
                    x: ((x - shiftX)),
                    y: ((y - shiftY)),
                    z: ((z - shiftZ)),
                };
                console.log('relative subtree key: ');
                console.log(relativeSubtreeKey);

                // Update the bit that corresponds to this rel subtree key (d, x, y, z)
                const indexOffsetToFirstByteOnLevel = arraySizes[subtreeLevel];
                // Treating the level as a linear array, what is the tiles index on this subtree level
                const bitIndexOnLevel = relativeSubtreeKey.z * dimOnLevelSqrd + relativeSubtreeKey.y * dimOnLevel + relativeSubtreeKey.x;
                // Which byte is holding this tile's bit
                const indexOffsetToByteOnLevel = bitIndexOnLevel >> 3;
                // which bit in the byte is holding this tile's availability
                const bitInByte = bitIndexOnLevel & 0b111; // modulo 8
                const subtreeArray = map.get(key);
                const index = indexOffsetToFirstByteOnLevel + indexOffsetToByteOnLevel;
                console.log('index: ' + index);
                subtreeArray[index] |= (1 << bitInByte);
            }
        }
    }
}

function updateSubtreesMapOct(range, subtreeLevel, subtreesDownTree, treeLevel, treeInfo) {
    console.log();
    console.log();
    console.log('proccesing range: ');
    console.log(range);
    console.log('on treelevel: ' + treeLevel);
    const map = treeInfo.map;
    const arraySize = treeInfo.arraySize;
    const arraySizes = treeInfo.arraySizes;
    const headCount = treeInfo.headCount;
    const subtreeLevels0Indexed = treeInfo.subtreeLevels0Indexed;

    const subtreeRootLevel = subtreesDownTree * subtreeLevels0Indexed;
    const dimOnLevel = (1 << subtreeLevel);
    const dimOnLevelSqrd = dimOnLevel * dimOnLevel;
    console.log('subtreeLevel: ' + subtreeLevel);
    console.log('subtreeRootLevel: ' + subtreeRootLevel);

    for (let z = range.startZ; z <= range.endZ; z++) {
        for (let y = range.startY; y <= range.endY; y++) {
            for (let x = range.startX; x <= range.endX; x++) {
                // TODO: most of this common to the non-packed version
                // Get the x y z of subtree root key that this range's (treeLevel x y z) resolves to
                const tilesHeadId = {
                    x: (x >> treeLevel),
                    y: (y >> treeLevel),
                    z: (z >> treeLevel),
                };
                console.log();
                console.log('tiles HeadId: ')
                console.log(tilesHeadId);

                // Subtree's root key within the tree
                const subtreeRootKey = {
                    d: subtreeRootLevel,
                    x: x >> subtreeLevel,
                    y: y >> subtreeLevel,
                    z: z >> subtreeLevel,
                };

                const tileKey = treeLevel + '/' + z + '/' + x + '/' + y;
                const key = subtreeRootKey.d + '/' + subtreeRootKey.z + '/' + subtreeRootKey.x + '/' + subtreeRootKey.y;
                console.log('subtree root key: ' + key + '  tile tree key: ' + tileKey);
                if (treeLevel === treeInfo.firstLevel) {
                    // treeInfo.tilesetJson.tilingScheme.roots.push({ d: subtreeRootKey.d, x: subtreeRootKey.x, y: subtreeRootKey.y, z: subtreeRootKey.z });
                    treeInfo.tilesetJson.tilingScheme.roots.push([ subtreeRootKey.d, subtreeRootKey.x, subtreeRootKey.y, subtreeRootKey.z ]);
                }

                // Create an array if doesn't exist. It is 0 inititialized.
                if (!map.has(key)) {
                    map.set(key, new Uint8Array(arraySize));
                }

                // Get the relative key within the subtree for the range's d x y z tree index
                // Get the head in which it lives
                // Amount to subtract off so that we are viewing xyz relative to the head it which it lives
                const shiftX = (subtreeRootKey.x << subtreeLevel);
                const shiftY = (subtreeRootKey.y << subtreeLevel);
                const shiftZ = (subtreeRootKey.z << subtreeLevel);
                // Shift off excess to get tile key within subtree
                const relativeSubtreeKey = {
                    d: subtreeLevel,
                    x: ((x - shiftX)),
                    y: ((y - shiftY)),
                    z: ((z - shiftZ)),
                };
                console.log('relative subtree key: ');
                console.log(relativeSubtreeKey);

                // Update the bit that corresponds to this rel subtree key (d, x, y, z)
                const indexOffsetToFirstByteOnLevel = arraySizes[subtreeLevel];
                // Treating the level as a linear array, what is the tiles index on this subtree level
                const indexOnLevel = relativeSubtreeKey.z * dimOnLevelSqrd + relativeSubtreeKey.y * dimOnLevel + relativeSubtreeKey.x;
                const subtreeArray = map.get(key);
                const index = indexOffsetToFirstByteOnLevel + indexOnLevel;
                console.log('index: ' + index);
                subtreeArray[index] = 1;
            }
        }
    }
}

        // var onLastLevel = ((level % subtreeLevels) === 0) && (level !== 0);
        // subtreeRootLevel -= onLastLevel ? 1 : 0; // Because there is overlap between subtree roots and their parents last level, take the previous subtree when on the overlap level

function updatePackedSubtreesMapQuad(range, subtreeLevel, subtreesDownTree, treeLevel, treeInfo) {
    // console.log();
    // console.log();
    // console.log('proccesing range: ');
    // console.log(range);
    // console.log('on treelevel: ' + treeLevel);
    const map = treeInfo.map;
    const arraySize = treeInfo.arraySize;
    const arraySizes = treeInfo.arraySizes;
    const headCount = treeInfo.headCount;
    const subtreeLevels0Indexed = treeInfo.subtreeLevels0Indexed;

    const subtreeRootLevel = subtreesDownTree * subtreeLevels0Indexed;
    const dimOnLevel = (1 << subtreeLevel);
    const dimOnLevelSqrd = dimOnLevel * dimOnLevel;
    // console.log('subtreeLevel: ' + subtreeLevel);
    // console.log('subtreeRootLevel: ' + subtreeRootLevel);

    for (let y = range.startY; y <= range.endY; y++) {
        for (let x = range.startX; x <= range.endX; x++) {
            // TODO: most of this common to the non-packed version
            // Get the x y z of subtree root key that this range's (treeLevel x y z) resolves to
            const tilesHeadId = {
                x: (x >> treeLevel),
                y: (y >> treeLevel),
            };
            // console.log();
            // console.log('tiles HeadId: ')
            // console.log(tilesHeadId);

            // Subtree's root key within the tree
            const subtreeRootKey = {
                d: subtreeRootLevel,
                x: x >> subtreeLevel,
                y: y >> subtreeLevel,
            };

            const tileKey = treeLevel + '/' + x + '/' + y;
            const key = subtreeRootKey.d + '/' + subtreeRootKey.x + '/' + subtreeRootKey.y;
            // console.log('subtree root key: ' + key + '  tile tree key: ' + tileKey);
            if (treeLevel === treeInfo.firstLevel) {
                // treeInfo.tilesetJson.tilingScheme.roots.push({ d: subtreeRootKey.d, x: subtreeRootKey.x, y: subtreeRootKey.y });
                treeInfo.tilesetJson.tilingScheme.roots.push([ subtreeRootKey.d, subtreeRootKey.x, subtreeRootKey.y ]);
            }

            // Create an array if doesn't exist. It is 0 inititialized.
            if (!map.has(key)) {
                map.set(key, new Uint8Array(arraySize));
            }

            // Get the relative key within the subtree for the range's d x y z tree index
            // Get the head in which it lives
            // Amount to subtract off so that we are viewing xyz relative to the head it which it lives
            const shiftX = (subtreeRootKey.x << subtreeLevel);
            const shiftY = (subtreeRootKey.y << subtreeLevel);
            // Shift off excess to get tile key within subtree
            const relativeSubtreeKey = {
                d: subtreeLevel,
                x: ((x - shiftX)),
                y: ((y - shiftY))
            };
            // console.log('relative subtree key: ');
            // console.log(relativeSubtreeKey);

            // Update the bit that corresponds to this rel subtree key (d, x, y, z)
            const indexOffsetToFirstByteOnLevel = arraySizes[subtreeLevel];
            // Treating the level as a linear array, what is the tiles index on this subtree level
            const bitIndexOnLevel = relativeSubtreeKey.y * dimOnLevel + relativeSubtreeKey.x;
            // Which byte is holding this tile's bit
            const indexOffsetToByteOnLevel = bitIndexOnLevel >> 3;
            // which bit in the byte is holding this tile's availability
            const bitInByte = bitIndexOnLevel & 0b111; // modulo 8
            const subtreeArray = map.get(key);
            const index = indexOffsetToFirstByteOnLevel + indexOffsetToByteOnLevel;
            // console.log('index: ' + index);
            subtreeArray[index] |= (1 << bitInByte);
        }
    }
}

function updateSubtreesMapQuad(range, subtreeLevel, subtreesDownTree, treeLevel, treeInfo) {
    console.log();
    console.log();
    console.log('proccesing range: ');
    console.log(range);
    console.log('on treelevel: ' + treeLevel);
    const map = treeInfo.map;
    const arraySize = treeInfo.arraySize;
    const arraySizes = treeInfo.arraySizes;
    const headCount = treeInfo.headCount;
    const subtreeLevels0Indexed = treeInfo.subtreeLevels0Indexed;

    const subtreeRootLevel = subtreesDownTree * subtreeLevels0Indexed;
    const dimOnLevel = (1 << subtreeLevel);
    const dimOnLevelSqrd = dimOnLevel * dimOnLevel;
    console.log('subtreeLevel: ' + subtreeLevel);
    console.log('subtreeRootLevel: ' + subtreeRootLevel);

    for (let y = range.startY; y <= range.endY; y++) {
        for (let x = range.startX; x <= range.endX; x++) {
            // TODO: most of this common to the non-packed version
            // Get the x y z of subtree root key that this range's (treeLevel x y z) resolves to
            const tilesHeadId = {
                x: (x >> treeLevel),
                y: (y >> treeLevel),
            };
            console.log();
            console.log('tiles HeadId: ')
            console.log(tilesHeadId);

            // Subtree's root key within the tree
            const subtreeRootKey = {
                d: subtreeRootLevel,
                x: x >> subtreeLevel,
                y: y >> subtreeLevel,
            };

            const tileKey = treeLevel + '/' + x + '/' + y;
            const key = subtreeRootKey.d + '/' + subtreeRootKey.x + '/' + subtreeRootKey.y;
            console.log('subtree root key: ' + key + '  tile tree key: ' + tileKey);
            if (treeLevel === treeInfo.firstLevel) {
                // treeInfo.tilesetJson.tilingScheme.roots.push({ d: subtreeRootKey.d, x: subtreeRootKey.x, y: subtreeRootKey.y });
                treeInfo.tilesetJson.tilingScheme.roots.push([ subtreeRootKey.d, subtreeRootKey.x, subtreeRootKey.y ]);
            }

            // Create an array if doesn't exist. It is 0 inititialized.
            if (!map.has(key)) {
                map.set(key, new Uint8Array(arraySize));
            }

            // Get the relative key within the subtree for the range's d x y z tree index
            // Get the head in which it lives
            // Amount to subtract off so that we are viewing xyz relative to the head it which it lives
            const shiftX = (subtreeRootKey.x << subtreeLevel);
            const shiftY = (subtreeRootKey.y << subtreeLevel);
            // Shift off excess to get tile key within subtree
            const relativeSubtreeKey = {
                d: subtreeLevel,
                x: ((x - shiftX)),
                y: ((y - shiftY))
            };
            console.log('relative subtree key: ');
            console.log(relativeSubtreeKey);

            // Update the byte that corresponds to this rel subtree key (d, x, y, z)
            const indexOffsetToFirstByteOnLevel = arraySizes[subtreeLevel];
            // Treating the level as a linear array, what is the tiles index on this subtree level
            const indexOnLevel = relativeSubtreeKey.y * dimOnLevel + relativeSubtreeKey.x;
            const subtreeArray = map.get(key);
            const index = indexOffsetToFirstByteOnLevel + indexOnLevel;
            console.log('index: ' + index);
            subtreeArray[index] = 1;
        }
    }
}
