const fs = require('fs');
const xml2js = require('xml2js');

const what = Object.prototype.toString;
const tagAndAttrLists = require('./tagAndAttrLists.json');
// traverse and fix json, based on code from https://community.apigee.com/questions/57407/how-to-iterate-through-a-json-object-to-findreplac.html
function walkObj(obj, fn, mode) {
  const wo = what.call(obj);
  if (wo === '[object Object]') {
    Object.keys(obj).forEach(key => {
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
    obj.forEach(item => {
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
    Object.keys(value).forEach(k => {
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
    Object.keys(value).forEach(k => {
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

const processFile = (inputPath, outputPath, processMode) =>
  new Promise((resolve, reject) => {
    const parser = new xml2js.Parser({ attrkey: '', mergeAttrs: true, explicitArray: false });
    fs.readFile(inputPath, (err, data) => {
      if (!err) {
        if (processMode === 'xml2json') {
          parser.parseString(data, (err2, result) => {
            if (!err2) {
              let mode = 'aim';
              if ('TemplateContainer' in result) mode = 'template';
              walkObj(result, checkAndFix, mode);
              fs.writeFileSync(outputPath, JSON.stringify(result), err3 => {
                if (err3) {
                  console.log(`Error processing ${inputPath}: ${err3.message}`);
                  reject(err3);
                } else resolve();
              });
            } else {
              console.log(`Error processing ${inputPath}: ${err2.message}`);
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
          fs.writeFileSync(outputPath, xml, err3 => {
            if (err3) {
              console.log(`Error writing xml ${inputPath}: ${err3.message}`);
              reject(err3);
            } else resolve();
          });
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
  new Promise((resolve, reject) => {
    let processMode = mode;
    const promises = [];
    try {
      const filenames = fs.readdirSync(inputPath);

      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath);
      }
      filenames.forEach(filename => {
        if (fs.lstatSync(`${inputPath}/${filename}`).isDirectory()) {
          promises.push(
            processDir(`${inputPath}/${filename}`, `${outputPath}/${filename}`, processMode)
          );
        } else if (filename.toLowerCase().endsWith('xml')) {
          if (processMode === 'first') {
            console.log(
              'No mode is given. Running in xml2json mode first as the first file met is xml'
            );
            processMode = 'xml2json';
          }
          if (processMode === 'xml2json')
            promises.push(
              processFile(
                `${inputPath}/${filename}`,
                `${outputPath}/${renameFile(filename, processMode)}`,
                processMode
              )
            );
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
      });

      Promise.all(promises)
        .then(() => {
          try {
            const files = fs.readdirSync(outputPath);
            if (files.length === 0) fs.rmdirSync(outputPath);
            resolve();
          } catch (err) {
            console.log(err);
            reject(err);
          }
        })
        .catch(err => {
          reject(err);
        });
    } catch (err) {
      console.log(err);
      reject(err);
    }
    //
  });

module.exports = () => {
  const args = process.argv.slice(2);
  if (args.length === 3) {
    // mode input output
    if (args[0] !== 'xml2json' && args[0] !== 'json2xml') {
      console.log('Unknown mode. Accepted modes are xml2json and json2xml');
      return;
    }
    if (fs.lstatSync(args[0]).isDirectory()) processDir(args[1], args[2], args[0]);
    else processFile(args[1], args[2], args[0]);
  } else if (args.length === 2) {
    // input output
    if (fs.lstatSync(args[0]).isDirectory()) processDir(args[0], args[1], 'first');
    else processFile(args[0], args[1], 'first');
  } else {
    console.log(
      'Unknown argument list. Sample usage: \n aimconvert xml2json aim.xml aim.json \n aimconvert json2xml jsons/ aims'
    );
    return;
  }

  console.log(`Done processing ${args[0]}`);
};
