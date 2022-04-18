const fs = require('fs');
const xml2js = require('xml2js');

const what = Object.prototype.toString;
const tagAndAttrLists = require('./tagAndAttrLists.json');
// traverse and fix json, based on code from https://community.apigee.com/questions/57407/how-to-iterate-through-a-json-object-to-findreplac.html
function walkObj(obj, fn, mode) {
  const wo = what.call(obj);
  if (wo === '[object Object]') {
    Object.keys(obj).forEach((key) => {
      fn(obj, key, mode);
      const item = obj[key];
      const w = what.call(item);
      if (w === '[object Object]' || w === '[object Array]') {
        walkObj(item, fn, mode);
      }
    });
  } else if (wo === '[object Array]') {
    obj.forEach((item, ix) => {
      fn(obj, ix, mode);
    });
    obj.forEach((item) => {
      const w = what.call(item);
      if (w === '[object Object]' || w === '[object Array]') {
        walkObj(item, fn, mode);
      }
    });
  }
}

function checkAndFix(parent, key, mode) {
  const value = parent[key];
  const w = what.call(value);
  const strDontRemoveTagListLocal = tagAndAttrLists.strDontRemoveTagList;
  const arrayTagListLocal =
    mode === 'aim' ? tagAndAttrLists.arrayTagList : tagAndAttrLists.arrayTagListTemplate;
  const evalExceptionMapLocal =
    mode === 'aim' ? tagAndAttrLists.evalExceptionMap : tagAndAttrLists.evalExceptionMapTemplate;

  const evalListLocal =
    mode === 'aim' ? tagAndAttrLists.evalList : tagAndAttrLists.evalListTemplate;

  if (w === '[object Object]') {
    const newObj = {};
    Object.keys(value).forEach((k) => {
      // removing empty items (keep DontRemoveTags, ex. codeSystemVersion)
      if (value[k] !== '' || strDontRemoveTagListLocal.includes(k)) {
        if (
          // number check for templates
          typeof value[k] === 'string' &&
          evalListLocal.includes(k) === true &&
          (!(k in evalExceptionMapLocal) || evalExceptionMapLocal[k].includes(key) === false)
        ) {
          const num = Number(value[k]);
          if (value[k] === 'true') newObj[k] = true;
          else if (value[k] === 'false') newObj[k] = false;
          else if (Number.isNaN(num) === false) newObj[k] = num;
          else newObj[k] = value[k];
        } else newObj[k] = value[k];
      }
    });
    if (arrayTagListLocal.includes(key)) {
      // eslint-disable-next-line no-param-reassign
      parent[key] = [newObj];
    } else {
      // eslint-disable-next-line no-param-reassign
      parent[key] = newObj;
    }
  }
}

function checkAndMarkAttr(parent, key, mode) {
  const value = parent[key];
  const w = what.call(value);

  if (w === '[object Object]') {
    const newObj = {};
    Object.keys(value).forEach((k) => {
      // console.log(k)
      if (
        key !== '@' && // if not already an attribute
        ((mode === 'aim' &&
          tagAndAttrLists.attrList.includes(k) &&
          (!(k in tagAndAttrLists.attrExceptionMap) ||
            (k in tagAndAttrLists.attrExceptionMap &&
              Number.isNaN(Number(key)) &&
              !tagAndAttrLists.attrExceptionMap[k].includes(key)))) || // aim
          (mode === 'template' && tagAndAttrLists.attrListTemplate.includes(k)))
      ) {
        // console.log(k, key, parent);
        if (!('@' in newObj)) newObj['@'] = {};
        newObj['@'][k] = value[k];
      } else newObj[k] = value[k];
    });
    // eslint-disable-next-line no-param-reassign
    parent[key] = newObj;
  }
}

const coordinateParser = (coordinateString) => {
  let coordArr = coordinateString.split(' ');
  coordArr = coordArr.filter((coord) => coord.length > 0 && coord !== ' ');
  const coordRes = [];
  let coordinateIndex = 0;
  for (let i = 0; i < coordArr.length - 1; i += 2) {
    const x = parseFloat(coordArr[i]);
    const y = parseFloat(coordArr[i + 1]);
    coordRes.push({ coordinateIndex, x: { value: x }, y: { value: y } });
    coordinateIndex += 1;
  }
  return coordRes;
};
const splineConverter = (coordList) => {
  // make a copy of the coordList
  const coords = [];
  for (let i = 0; i < coordList.length; i += 1) {
    const coordinate = { x: coordList[i].x.value, y: coordList[i].y.value };
    coords.push(coordinate);
  }
  let tot = coords.length;

  // if input doesn't repeat the start point, we do it for you
  if (!(coords[0].x === coords[tot - 1].x && coords[0].y === coords[tot - 1].y)) {
    coords.push({ x: coordList[0].x.value, y: coordList[0].y.value });
    tot += 1;
  }
  let aax;
  let bbx;
  let ccx;
  let ddx;
  let aay;
  let bby;
  let ccy;
  let ddy; // coef of spline

  // if( scale > 5) scale = 5;
  const scale = 1;
  //
  // // function spline S(x) = a x3 + bx2 + cx + d
  // // with S continue, S1 continue, S2 continue.
  // // smoothing of a closed polygon given by a list of points (x,y)
  // // we compute a spline for x and a spline for y
  // // where x and y are function of d where t is the distance
  // between points
  //
  // // compute tridiag matrix
  // // | b1 c1 0 ... | | u1 | | r1 |
  // // | a2 b2 c2 0 ... | | u2 | | r2 |
  // // | 0 a3 b3 c3 0 ... | * | ... | = | ... |
  // // | ... | | ... | | ... |
  // // | an-1 bn-1 cn-1 | | ... | | ... |
  // // | 0 an bn | | un | | rn |
  // // bi = 4
  // // resolution algorithm is taken from the book : Numerical
  // recipes in C
  //
  // // initialization of different vectors
  // // element number 0 is not used (except h[0])
  const nb = tot + 2;

  // a, c, cx, cy, d, g, gam, h, px, py = malloc(nb*sizeof(double));
  // BOOL failed = NO;
  //
  // Initialization
  const a = [];
  const c = [];
  const cx = [];
  const cy = [];
  const d = [];
  const g = [];
  const gam = [];
  const h = [];
  const px = [];
  const py = [];

  for (let i = 0; i < nb; i += 1) {
    a[i] = 0;
    c[i] = 0;
    cx[i] = 0;
    cy[i] = 0;
    d[i] = 0;
    g[i] = 0;
    gam[i] = 0;
    h[i] = 0;
    cx[i] = 0;
    cy[i] = 0;
  }

  // // as a spline starts and ends with a line one adds two points
  // // in order to have continuity in starting point
  // for (i=0; i<tot; i++)
  // {
  // px[i+1] = Pt[i].x;// * fZoom / 100;
  // py[i+1] = Pt[i].y;// * fZoom / 100;
  // }
  for (let i = 0; i < tot; i += 1) {
    px[i + 1] = coords[i].x;
    py[i + 1] = coords[i].y;
  }

  px[0] = px[nb - 3];
  py[0] = py[nb - 3];
  // eslint-disable-next-line prefer-destructuring
  px[nb - 1] = px[2];
  // eslint-disable-next-line prefer-destructuring
  py[nb - 1] = py[2];

  // // check all points are separate, if not do not smooth
  // // this happens when the zoom factor is too small
  // // so in this case the smooth is not useful
  //
  // // define hi (distance between points) h0 distance between 0 and
  // 1.
  // // di distance of point i from start point
  let xi;
  let yi;

  for (let i = 0; i < nb - 1; i += 1) {
    xi = px[i + 1] - px[i];
    yi = py[i + 1] - py[i];
    h[i] = Math.sqrt(xi * xi + yi * yi) * scale;
    d[i + 1] = d[i] + h[i];
  }

  // define ai and ci
  for (let i = 2; i < nb - 1; i += 1) a[i] = (2.0 * h[i - 1]) / (h[i] + h[i - 1]);
  for (let i = 1; i < nb - 2; i += 1) c[i] = (2.0 * h[i]) / (h[i] + h[i - 1]);

  // define gi in function of x
  // gi+1 = 6 * Y[hi, hi+1, hi+2],
  // Y[hi, hi+1, hi+2] = [(yi - yi+1)/(di - di+1) - (yi+1 -
  // yi+2)/(di+1 - di+2)]
  // / (di - di+2)
  for (let i = 1; i < nb - 1; i += 1)
    g[i] =
      (6.0 * ((px[i - 1] - px[i]) / (d[i - 1] - d[i]) - (px[i] - px[i + 1]) / (d[i] - d[i + 1]))) /
      (d[i - 1] - d[i + 1]);

  // // compute cx vector
  let b;
  let bet;
  b = 4;
  bet = 4;
  cx[1] = g[1] / b;
  for (let j = 2; j < nb - 1; j += 1) {
    gam[j] = c[j - 1] / bet;
    bet = b - a[j] * gam[j];
    cx[j] = (g[j] - a[j] * cx[j - 1]) / bet;
  }
  for (let j = nb - 2; j >= 1; j -= 1) cx[j] -= gam[j + 1] * cx[j + 1];

  // define gi in function of y
  // gi+1 = 6 * Y[hi, hi+1, hi+2],
  // Y[hi, hi+1, hi+2] = [(yi - yi+1)/(hi - hi+1) - (yi+1 -
  // yi+2)/(hi+1 - hi+2)]
  // / (hi - hi+2)
  for (let i = 1; i < nb - 1; i += 1)
    g[i] =
      (6.0 * ((py[i - 1] - py[i]) / (d[i - 1] - d[i]) - (py[i] - py[i + 1]) / (d[i] - d[i + 1]))) /
      (d[i - 1] - d[i + 1]);

  // compute cy vector
  b = 4.0;
  bet = 4.0;
  cy[1] = g[1] / b;
  for (let j = 2; j < nb - 1; j += 1) {
    gam[j] = c[j - 1] / bet;
    bet = b - a[j] * gam[j];
    cy[j] = (g[j] - a[j] * cy[j - 1]) / bet;
  }
  for (let j = nb - 2; j >= 1; j -= 1) cy[j] -= gam[j + 1] * cy[j + 1];

  // OK we have the cx and cy vectors, from that we can compute the
  // coeff of the polynoms for x and y and for each interval
  // S(x) (xi, xi+1) = ai + bi (x-xi) + ci (x-xi)2 + di (x-xi)3
  // di = (ci+1 - ci) / 3 hi
  // ai = yi
  // bi = ((ai+1 - ai) / hi) - (hi/3) (ci+1 + 2 ci)

  let res = '';
  // for each interval
  for (let i = 1; i < nb - 2; i += 1) {
    // compute coef for x polynom
    ccx = cx[i];
    aax = px[i];
    ddx = (cx[i + 1] - cx[i]) / (3.0 * h[i]);
    bbx = (px[i + 1] - px[i]) / h[i] - (h[i] / 3.0) * (cx[i + 1] + 2.0 * cx[i]);

    // compute coef for y polynom
    ccy = cy[i];
    aay = py[i];
    ddy = (cy[i + 1] - cy[i]) / (3.0 * h[i]);
    bby = (py[i + 1] - py[i]) / h[i] - (h[i] / 3.0) * (cy[i + 1] + 2.0 * cy[i]);

    // compute points in this interval and display
    const p1x = aax;
    const p1y = aay;
    res += ` ${p1x} ${p1y}`;

    for (let j = 1; j <= h[i]; j += 1) {
      const p2x = aax + bbx * j + ccx * (j * j) + ddx * (j * j * j);
      const p2y = aay + bby * j + ccy * (j * j) + ddy * (j * j * j);
      res += ` ${p2x} ${p2y}`;
    } // endfor points in 1 interval
  } // endfor each interval
  res = coordinateParser(res);
  return res;
};

const processFile = (inputPath, outputPath, convertMode) =>
  new Promise((resolve, reject) => {
    let processMode = convertMode;
    if (processMode === 'first') {
      if (inputPath.toLowerCase().endsWith('json')) {
        console.log('No mode is given. found json, converting to xml');
        processMode = 'json2xml';
      } else {
        console.log('No mode is given. Trying to convert to json');
        processMode = 'xml2json';
      }
    }
    const parser = new xml2js.Parser({ attrkey: '', mergeAttrs: true, explicitArray: false });
    fs.readFile(inputPath, (err, data) => {
      if (!err) {
        if (processMode === 'xml2json') {
          parser.parseString(data, (err2, result) => {
            if (!err2 && result) {
              let mode = 'aim';
              if ('TemplateContainer' in result) mode = 'template';
              walkObj(result, checkAndFix, mode);

              if (mode !== 'template') {
                const markupEntity = result.ImageAnnotationCollection.imageAnnotations
                  .ImageAnnotation[0].markupEntityCollection
                  ? result.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                      .markupEntityCollection.MarkupEntity[0]
                  : null;
                const aimID = markupEntity ? markupEntity.uniqueIdentifier.root : null;
                const isSpline = aimID ? aimID.includes('spline') : null;

                if (isSpline) {
                  const coordinates =
                    markupEntity.twoDimensionSpatialCoordinateCollection
                      .TwoDimensionSpatialCoordinate;

                  const convertedCoordinates = splineConverter(coordinates);

                  markupEntity.twoDimensionSpatialCoordinateCollection.TwoDimensionSpatialCoordinate =
                    convertedCoordinates;
                  markupEntity.uniqueIdentifier.root = markupEntity.uniqueIdentifier.root.replace(
                    '###.spline.###',
                    ''
                  );

                  if (
                    result.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                      .imageAnnotationStatementCollection
                  ) {
                    const imgAnnotationStatements =
                      result.ImageAnnotationCollection.imageAnnotations.ImageAnnotation[0]
                        .imageAnnotationStatementCollection.ImageAnnotationStatement;

                    imgAnnotationStatements.forEach((statement) => {
                      // eslint-disable-next-line no-param-reassign
                      statement.objectUniqueIdentifier.root =
                        statement.objectUniqueIdentifier.root.replace('###.spline.###', '');
                    });
                  }
                }
              }
              try {
                fs.writeFileSync(outputPath, JSON.stringify(result));
                resolve();
              } catch (err3) {
                console.log(`Error processing ${inputPath}: ${err3.message}`);
                reject(err3);
              }
            } else {
              console.log(`Error processing ${inputPath}: ${err2 ? err2.message : 'no result'}`);
              reject(err2);
            }
          });
        } else if (processMode === 'json2xml') {
          const result = JSON.parse(data);
          let mode = 'aim';
          if ('TemplateContainer' in result) mode = 'template';
          walkObj(result, checkAndMarkAttr, mode);
          const builder = new xml2js.Builder({ attrkey: '@' });
          const xml = builder.buildObject(result);
          // console.log(xml);
          try {
            fs.writeFileSync(outputPath, xml);
            resolve();
          } catch (err3) {
            console.log(`Error writing xml ${inputPath}: ${err3.message}`);
            reject(err3);
          }
        }
      } else {
        console.log(`Error processing ${inputPath}: ${err.message}`);
        reject(err);
      }
    });
  });

function renameFile(filename, mode) {
  console.log(filename, mode);
  switch (mode) {
    case 'json2xml':
      console.log(`${filename.replace('.json', '').replace('.JSON', '')}.xml`);
      return `${filename.replace('.json', '').replace('.JSON', '')}.xml`;
    case 'xml2json':
      return `${filename.replace('.xml', '').replace('.XML', '')}.json`;

    default:
      // 'xml2json'
      return `${filename.replace('.xml', '').replace('.XML', '')}.json`;
  }
}
const processDir = (inputPath, outputPath, mode) =>
  new Promise(async (resolve, reject) => {
    let processMode = mode;
    const promises = [];
    try {
      const filenames = fs.readdirSync(inputPath);

      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath);
      }
      for (let i = 0; i < filenames.length; i += 1) {
        const filename = filenames[i];
        if (fs.lstatSync(`${inputPath}/${filename}`).isDirectory()) {
          await processDir(`${inputPath}/${filename}`, `${outputPath}/${filename}`, processMode);
        } else if (filename.toLowerCase().endsWith('xml')) {
          if (processMode === 'first') {
            console.log(
              'No mode is given. Running in xml2json mode first as the first file met is xml'
            );
            processMode = 'xml2json';
          }
          if (processMode === 'xml2json') {
            await processFile(
              `${inputPath}/${filename}`,
              `${outputPath}/${renameFile(filename, processMode)}`,
              processMode
            );
          }
        } else if (filename.toLowerCase().endsWith('json')) {
          if (processMode === 'first') {
            console.log(
              'No mode is given. Running in json2xml mode first as the first file met is json'
            );
            processMode = 'json2xml';
          }
          if (processMode === 'json2xml')
            promises.push(
              processFile(
                `${inputPath}/${filename}`,
                `${outputPath}/${renameFile(filename, processMode)}`,
                processMode
              )
            );
        }
      }

      // delete the output dir if empty
      try {
        const files = fs.readdirSync(outputPath);
        if (files.length === 0) fs.rmdirSync(outputPath);
        resolve();
      } catch (err) {
        console.log(err);
        reject(err);
      }
    } catch (err) {
      console.log(err);
      reject(err);
    }
    //
  });

module.exports = async () => {
  const args = process.argv.slice(2);
  if (args.length === 3) {
    // mode input output
    if (args[0] !== 'xml2json' && args[0] !== 'json2xml') {
      console.log('Unknown mode. Accepted modes are xml2json and json2xml');
      return;
    }
    if (fs.lstatSync(args[1]).isDirectory()) await processDir(args[1], args[2], args[0]);
    else await processFile(args[1], args[2], args[0]);
    console.log(`Done processing ${args[1]}`);
  } else if (args.length === 2) {
    // input output
    if (fs.lstatSync(args[0]).isDirectory()) await processDir(args[0], args[1], 'first');
    else await processFile(args[0], args[1], 'first');
    console.log(`Done processing ${args[0]}`);
  } else {
    console.log(
      'Unknown argument list. Sample usage: \n aimconvert xml2json aim.xml aim.json \n aimconvert json2xml jsons/ aims'
    );
  }
};
