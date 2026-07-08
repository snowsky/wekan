import { Meteor } from 'meteor/meteor';

let asyncExec;
let fs;
let FileType;

if (Meteor.isServer) {
  const { exec } = Npm.require('child_process');
  const { promisify } = Npm.require('util');
  asyncExec = promisify(exec);
  fs = Npm.require('fs');
  FileType = Npm.require('file-type');
}

export async function isFileValid(fileObj, mimeTypesAllowed, sizeAllowed, externalCommandLine) {
  let isValid = true;

  if (Meteor.settings.public.ostrioFilesMigrationInProgress !== "true") {
    if (mimeTypesAllowed.length) {
      const mimeTypeResult = await FileType.fromFile(fileObj.path);

      const mimeType = (mimeTypeResult ? mimeTypeResult.mime : fileObj.type);
      const baseMimeType = mimeType.split('/', 1)[0];

      isValid = mimeTypesAllowed.includes(mimeType) || mimeTypesAllowed.includes(baseMimeType + '/*') || mimeTypesAllowed.includes('*');

      if (!isValid) {
        console.log("Validation of uploaded file failed: file " + fileObj.path + " - mimetype " + mimeType);
      }
    }

    if (isValid && sizeAllowed && fileObj.size > sizeAllowed) {
      console.log("Validation of uploaded file failed: file " + fileObj.path + " - size " + fileObj.size);
      isValid = false;
    }

    if (isValid && externalCommandLine) {
      try {
        await asyncExec(externalCommandLine.replace("{file}", '"' + fileObj.path + '"'));
        isValid = fs.existsSync(fileObj.path);

        if (!isValid) {
          console.log("Validation of uploaded file failed: file " + fileObj.path + " has been deleted externally");
        }
      } catch (execError) {
        // Many scanners (e.g. clamscan) exit non-zero when they detect malware,
        // instead of or in addition to deleting the file. Treat a failing
        // external command as invalid rather than letting the exception bypass validation.
        isValid = false;
        console.log("Validation of uploaded file failed: file " + fileObj.path + " - external command exited with an error: " + execError.message);
      }
    }

    if (isValid) {
      console.debug("Validation of uploaded file successful: file " + fileObj.path);
    }
  }

  return isValid;
}
