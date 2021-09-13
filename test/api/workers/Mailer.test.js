const nock = require('nock');

const Mailer = require('../../../api/workers/Mailer');

describe('Mailer', () => {
  describe('.send()', () => {
    it('sends a POST request to the mailer with basic auth and data', async () => {
      const host = 'http://localhost:2343';
      const password = 'password';
      const username = 'username';
      const to = ['foo@bar.com'];
      const cc = ['foo-cc@bar.com'];
      const bcc = ['foo-bcc@bar.com'];
      const subject = 'This is only a test';
      const html = '<p>For real, only a test<p>';

      const mailer = new Mailer({ host, password, username });

      const scope = nock(host, {
        reqheaders: {
          authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('Base64')}`,
        },
      })
        .post('/send', { html, subject, to, cc, bcc })
        .reply(200);

      await mailer.send({ html, subject, to, cc, bcc });

      scope.done();
    });
  });
});
