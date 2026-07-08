/* eslint-env mocha */
import { Random } from 'meteor/random';
import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isFileValid } from '/models/fileValidation';

describe('isFileValid', function() {
  let tmpFiles = [];

  function makeTempFile(bytes) {
    const filePath = path.join(os.tmpdir(), `wekan-test-${Random.id()}`);
    fs.writeFileSync(filePath, bytes);
    tmpFiles.push(filePath);
    return filePath;
  }

  before(function() {
    Meteor.settings.public = Meteor.settings.public || {};
  });

  afterEach(function() {
    tmpFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
    tmpFiles = [];
    delete Meteor.settings.public.ostrioFilesMigrationInProgress;
  });

  it('passes when no validation is configured', async function() {
    const fileObj = { path: makeTempFile(Buffer.from('hello')), size: 5, type: 'text/plain' };
    expect(await isFileValid(fileObj, [], 0, undefined)).to.equal(true);
  });

  it('accepts a real image whose bytes match the mime type allowlist', async function() {
    // file-type needs more than the bare signature to read a chunk header, so pad it
    const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const fileObj = { path: makeTempFile(pngBytes), size: pngBytes.length, type: 'image/png' };
    expect(await isFileValid(fileObj, ['image/png'], 0, undefined)).to.equal(true);
  });

  it('rejects an executable disguised with an image extension/mime type', async function() {
    // MZ header: real bytes of a Windows executable, saved/declared as image/png
    const exeBytes = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), Buffer.alloc(32)]);
    const fileObj = { path: makeTempFile(exeBytes), size: exeBytes.length, type: 'image/png' };
    expect(await isFileValid(fileObj, ['image/png', 'image/jpeg'], 0, undefined)).to.equal(false);
  });

  it('rejects a file larger than the configured size limit', async function() {
    const fileObj = { path: makeTempFile(Buffer.from('x')), size: 1000, type: 'text/plain' };
    expect(await isFileValid(fileObj, [], 10, undefined)).to.equal(false);
  });

  it('accepts a file within the configured size limit', async function() {
    const fileObj = { path: makeTempFile(Buffer.from('x')), size: 5, type: 'text/plain' };
    expect(await isFileValid(fileObj, [], 10, undefined)).to.equal(true);
  });

  it('rejects a file that an external scanner removes', async function() {
    const filePath = makeTempFile(Buffer.from('infected'));
    const fileObj = { path: filePath, size: 8, type: 'text/plain' };
    expect(await isFileValid(fileObj, [], 0, 'rm -f {file}')).to.equal(false);
    expect(fs.existsSync(filePath)).to.equal(false);
  });

  it('rejects a file when the external scanner exits with an error, even if it left the file in place', async function() {
    const filePath = makeTempFile(Buffer.from('infected'));
    const fileObj = { path: filePath, size: 8, type: 'text/plain' };
    expect(await isFileValid(fileObj, [], 0, 'echo scanning {file}; exit 1')).to.equal(false);
  });

  it('accepts a file when the external scanner exits cleanly and leaves the file in place', async function() {
    const filePath = makeTempFile(Buffer.from('clean'));
    const fileObj = { path: filePath, size: 5, type: 'text/plain' };
    expect(await isFileValid(fileObj, [], 0, 'echo scanning {file}')).to.equal(true);
  });

  it('skips all validation while an ostrio files migration is in progress', async function() {
    Meteor.settings.public.ostrioFilesMigrationInProgress = 'true';
    const fileObj = { path: makeTempFile(Buffer.from('x')), size: 999999, type: 'text/plain' };
    expect(await isFileValid(fileObj, ['image/png'], 1, 'exit 1')).to.equal(true);
  });
});
