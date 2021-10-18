const crypto = require('crypto');
const { expect } = require('chai');
const sinon = require('sinon');
const nock = require('nock');
const config = require('../../../../config');
const { logger } = require('../../../../winston');
const { Build, Site, User } = require('../../../../api/models');
const factory = require('../../support/factory');
const githubAPINocks = require('../../support/githubAPINocks');
const { buildViewLink } = require('../../../../api/utils/build');
const GitHub = require('../../../../api/services/GitHub');
const GithubBuildHelper = require('../../../../api/services/GithubBuildHelper');
const EventCreator = require('../../../../api/services/EventCreator');

const requestedCommitSha = 'a172b66c31e19d456a448041a5b3c2a70c32d8b7';
const clonedCommitSha = '7b8d23c07a2c3b5a140844a654d91e13c66b271a';

describe('GithubBuildHelper', () => {
  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  describe('reportBuildStatus(build)', () => {
    context('with a build in the processing state', () => {
      let user;
      let site;
      let build;
      let users;
      beforeEach(async () => {
        user = await factory.user();
        site = await factory.site({ users: [user] });
        build = await factory.build({
          state: 'processing',
          site,
          user,
          requestedCommitSha,
        });
        users = await site.getUsers();
      })
      it("should report that the status is 'pending'", async () => {
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: site.owner,
          repo: site.repository,
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          repository: site.repository,
          sha: requestedCommitSha,
          state: 'pending',
        });
        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);

          expect(repoNock.isDone()).to.be.true;
          expect(statusNock.isDone()).to.be.true;
      });

      it("should report the status if the build user does not have permission'", async () => {
        const repoNocks = [];
        build = await factory.build({
          state: 'processing',
          site,
          requestedCommitSha,
        });
        await site.addUser(build.user)

        let i;
        let options;
        for (i = 0; i < users.length; i += 1) {
          options = {
            accessToken: users[i].githubAccessToken,
            owner: site.owner,
            repo: site.repository,
            username: users[i].username,
          };
          if (users[i].id === build.user) { options.response = [201, { permissions: {} }]; }
          repoNocks.push(githubAPINocks.repo(options));
        }

        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          repository: site.repository,
          sha: requestedCommitSha,
          state: 'pending',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
        expect(statusNock.isDone()).to.be.true;
      });

      it("should report the status if the build initiated by a contributor", async () => {
        const repoNocks = [];
        await build.update({ user: null, username: 'contributor' });
        users = await site.getUsers();
        let i;
        let options;
        for (i = 0; i < users.length; i += 1) {
          options = {
            accessToken: users[i].githubAccessToken,
            owner: site.owner,
            repo: site.repository,
            username: users[i].username,
          };
          repoNocks.push(githubAPINocks.repo(options));
        }

        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          repository: site.repository,
          sha: requestedCommitSha,
          state: 'pending',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
        expect(statusNock.isDone()).to.be.true;
      });

      it("should report the status if the build initiated by an non-authed user", async () => {
        const repoNocks = [];
        const newUser = await factory.user({ githubAccessToken: null })
        await build.update({ user: newUser.id, username: newUser.username });
        users = await site.getUsers();
        let i;
        let options;
        for (i = 0; i < users.length; i += 1) {
          options = {
            accessToken: users[i].githubAccessToken,
            owner: site.owner,
            repo: site.repository,
            username: users[i].username,
          };
          repoNocks.push(githubAPINocks.repo(options));
        }

        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          repository: site.repository,
          sha: requestedCommitSha,
          state: 'pending',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
        expect(statusNock.isDone()).to.be.true;
      });

      it("should report that the status if the build user has invalid token'", async() => {
        const repoNocks = [];
        const errorEventSpy = sinon.spy(EventCreator, 'error');
        await user.update({ signedInAt: '1999-01-01'});
        const otherUser = await factory.user();
        await site.addUser(otherUser);
        users = await site.getUsers();

        let i;
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: user.username,
          response: [403, { permissions: {} }],
        }));
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: otherUser.username,
        }));
        
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          repository: site.repository,
          sha: requestedCommitSha,
          state: 'pending',
        });
        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
        expect(statusNock.isDone()).to.be.true;
      });

      it("should report that the status if the build user does not have write permissions'", async() => {
        const repoNocks = [];
        const errorEventSpy = sinon.spy(EventCreator, 'error');
        await user.update({ signedInAt: '1999-01-01'});
        const otherUser = await factory.user();
        await site.addUser(otherUser);
        users = await site.getUsers();

        let i;
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: user.username,
          response: [201, { permissions: {} }],
        }));
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: otherUser.username,
        }));
        
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          repository: site.repository,
          sha: requestedCommitSha,
          state: 'pending',
        });
        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
        expect(statusNock.isDone()).to.be.true;
      });

      it("should not report that the status if the build user has invalid token'", async() => {
        const repoNocks = [];
        const statusSpy = sinon.spy(GitHub, 'sendCreateGithubStatusRequest');
        const recentUser = await factory.user();
        await site.addUser(recentUser);
        users = await site.getUsers();

        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: user.username,
          response: [403, { permissions: {} }],
        }));
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: user.username,
          response: [403, { permissions: {} }],
        }));
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: recentUser.username,
          response: [403, { permissions: {} }],
        }));
        
        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        const err =  await GithubBuildHelper.reportBuildStatus(build).catch(e => e);
        repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
        expect(statusSpy.called).to.be.false;
        expect(err.message).to.equal(`Unable to find valid access token to report build@id=${build.id} status`);
      });

      it("should not report that the status if the build user does not have write permissions'", async() => {
        const repoNocks = [];
        const statusSpy = sinon.spy(GitHub, 'sendCreateGithubStatusRequest');
        const recentUser = await factory.user();
        await site.addUser(recentUser);
        users = await site.getUsers();

        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: user.username,
          response: [201, { permissions: {} }],
        }));
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: user.username,
          response: [201, { permissions: {} }],
        }));
        repoNocks.push(githubAPINocks.repo({
          owner: site.owner,
          repo: site.repository,
          username: recentUser.username,
          response: [201, { permissions: {} }],
        }));
        
        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        const err =  await GithubBuildHelper.reportBuildStatus(build).catch(e => e);
        repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
        expect(statusSpy.called).to.be.false;
        expect(err.message).to.equal(`Unable to find valid access token to report build@id=${build.id} status`);
      });

      it('should set the target uri to the build logs', async() => {
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: site.owner,
          repo: site.repository,
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          sha: requestedCommitSha,
          targetURL: `${config.app.hostname}/sites/${build.site}/builds/${build.id}/logs`,
        });
        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
      });
    });

    context('with a build in the created state', () => {
      let user;
      let site;
      let build;
      let users;
      beforeEach(async() => {
        user = await factory.user();
        site = await factory.site({ owner: 'test-owner', repository: 'test-repo', users: [user] });
        build = await factory.build({
          state: 'created',
          site,
          requestedCommitSha,
          user,
        });
        users = await site.getUsers();
      })

      it("should report that the status is 'pending'", async() => {
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: 'test-owner',
          repo: 'test-repo',
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: 'test-owner',
          repo: 'test-repo',
          repository: 'test-repo',
          sha: requestedCommitSha,
          state: 'pending',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
      });

      it('should set the target uri to the build logs', async() => {
        const repoNock = githubAPINocks.repo({
          accessToken: 'fake-access-token',
          owner: 'test-owner',
          repo: 'test-repo',
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: 'test-owner',
          repo: 'test-repo',
          sha: requestedCommitSha,
          targetURL: `${config.app.hostname}/sites/${build.site}/builds/${build.id}/logs`,
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await  GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
         
      });
    });

    context('with a build in the queued state', () => {
      let user;
      let site;
      let build;
      let users;
      beforeEach(async() => {
        user = await factory.user();
        site = await factory.site({ owner: 'test-owner', repository: 'test-repo', users: [user] });
        build = await factory.build({
          state: 'created',
          site,
          requestedCommitSha,
          user,
        });
        users = await site.getUsers();
      })
      it("should report that the status is 'pending'", async() => {
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: 'test-owner',
          repo: 'test-repo',
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: 'test-owner',
          repo: 'test-repo',
          repository: 'test-repo',
          sha: requestedCommitSha,
          state: 'pending',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
      });

      it('should set the target uri to the build logs', async() => {
        const repoNock = githubAPINocks.repo({
          accessToken: 'fake-access-token',
          owner: 'test-owner',
          repo: 'test-repo',
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: 'test-owner',
          repo: 'test-repo',
          sha: requestedCommitSha,
          targetURL: `${config.app.hostname}/sites/${build.site}/builds/${build.id}/logs`,
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
      });
    });

    context('with every build', () => {
      const origAppEnv = config.app.appEnv;
      let user;
      let site;
      let build;
      let users;
      after(() => {
        // reset config.app.appEnv to its original value
        config.app.appEnv = origAppEnv;
      });

      beforeEach(async() => {
        user = await factory.user();
        site = await  factory.site({ owner: 'test-owner', repository: 'test-repo', users: [user] })
        build = await factory.build({
          state: 'success',
          site,
          requestedCommitSha,
          clonedCommitSha,
          user,
        });
        users = await site.getUsers();
      })

      it('should set status context to "federalist/build" when APP_ENV is "production"', async() => {
        config.app.appEnv = 'production';
        const repoNock = githubAPINocks.repo({
          accessToken: 'fake-access-token',
          owner: 'test-owner',
          repo: 'test-repo',
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: 'test-owner',
          repo: 'test-repo',
          sha: clonedCommitSha,
          state: 'success',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
      });
    });

    context('with a build in the success state', () => {
      let user;
      let site;
      let build;
      let users;
      beforeEach(async() => {
        user = await factory.user();
        site = await  factory.site({ users: [user] })
        build = await factory.build({
          state: 'success',
          requestedCommitSha,
          clonedCommitSha,
          user,
          site,
        });
        users = await site.getUsers();
      })
      it("should report that the status is 'success'", async() => {
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: site.owner,
          repo: site.repository,
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          sha: clonedCommitSha,
          state: 'success',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
      });

      it('should set the target uri to the preview link', async() => {
        await build.update({branch: 'preview-branch'});
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: site.owner,
          repo: site.repository,
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          sha: clonedCommitSha,
          targetURL: buildViewLink(build, site),
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(repoNock.isDone()).to.be.true;
        expect(statusNock.isDone()).to.be.true;
      });
    });

    context('with a build in the error state', () => {
      let user;
      let site;
      let build;
      let users;
      beforeEach(async() => {
        user = await factory.user();
        site = await  factory.site({ users: [user] })
        build = await factory.build({
          state: 'error',
          requestedCommitSha,
          user,
          site,
        });
        users = await site.getUsers();
      });
      it("should report that the status is 'error' with requestedCommitSha", async () => {        
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: site.owner,
          repo: site.repository,
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          sha: requestedCommitSha,
          state: 'error',
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await  GithubBuildHelper.reportBuildStatus(build);
        expect(statusNock.isDone()).to.be.true;
        expect(repoNock.isDone()).to.be.true;
      });

      it("should report that the status is 'error' with clonedCommitSha", async () => {
        await build.update({ clonedCommitSha });
        
        const repoNock = githubAPINocks.repo({
          accessToken: user.githubAccessToken,
          owner: site.owner,
          repo: site.repository,
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          sha: clonedCommitSha,
          state: 'error',
          targetURL: `${config.app.hostname}/sites/${build.site}/builds/${build.id}/logs`,
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
        expect(statusNock.isDone()).to.be.true;
        expect(repoNock.isDone()).to.be.true;
      });

      it("should use the GitHub access token of the build's user not a site user", async () => {
        const nonSiteUser = await factory.user();
        await build.update({ user: nonSiteUser.id });
        
          const repoNock = githubAPINocks.repo({
          accessToken: nonSiteUser.githubAccessToken,
          owner: site.owner,
          repo: site.repository,
          username: user.username,
        });
        const statusNock = githubAPINocks.status({
          owner: site.owner,
          repo: site.repository,
          sha: requestedCommitSha,
          state: 'error',
          targetURL: `${config.app.hostname}/sites/${build.site}/builds/${build.id}/logs`,
        });

        await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
        await GithubBuildHelper.reportBuildStatus(build);
      
        expect(statusNock.isDone()).to.be.true;
        expect(repoNock.isDone()).to.be.true;
      });
    });
  });

  describe('fetchContent(build, site, users, path)', () => {
    let user;
    let site;
    let build;
    let users;
    const path = 'filePath.txt';
    beforeEach(async() => {
      user = await factory.user();
      site = await  factory.site({ users: [user] })
      build = await factory.build({
        state: 'success',
        requestedCommitSha,
        clonedCommitSha,
        user,
        site,
      });
      users = await site.getUsers();
    });

    it('should fetch the content requested', async () => {
      const fetchContentGitStub = sinon.stub(GitHub, 'getContent').resolves('testContent');
      const checkPermissionsGitStub = sinon.stub(GitHub, 'checkPermissions').resolves({ push: true });
      await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
      const content = await GithubBuildHelper.fetchContent(build, path);
      expect(content).to.equal('testContent');
    });

    it('should not fetch the content requested w/o clonedCommitSha', async () => {
      await build.update({ requestedCommitSha:null, clonedCommitSha: null });
      await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
      const err = await GithubBuildHelper.fetchContent(build, path).catch(e => e);
      expect(err.message).to.equal(`Build or commit sha undefined. Unable to fetch ${path} for build@id=${build.id}`);
    });
  });

  describe('.loadBuildUserAccessToken', () => {
    let user;
    let site;
    let build;
    let users;
    beforeEach(async () => {
      user = await factory.user({ signedInAt: '1999-12-31'});
      site = await factory.site({ users: [user] });
      build = await factory.build({
        site,
        user,
      });
      users = await site.getUsers();
    })

    it('should fetch buildUser token', async () => {
      const repoNock = githubAPINocks.repo({
        accessToken: user.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: user.username,
      });
      await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
      const githubAccessToken = await GithubBuildHelper.loadBuildUserAccessToken(build);
      expect(githubAccessToken).to.equal(user.githubAccessToken);
      expect(repoNock.isDone()).to.be.true;
    });

    it('should fetch a siteUser token - build user no access to private repo', async () => {
      const siteUser = await factory.user();
      await site.addUser(siteUser);
      users = await site.getUsers();
      const repoNocks = [];
      repoNocks.push(githubAPINocks.repo({
        accessToken: user.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: user.username,
        response: [403, { permissions: {} }],
      }));
      repoNocks.push(githubAPINocks.repo({
        accessToken: siteUser.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: siteUser.username,
      }));
      await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
      const githubAccessToken = await GithubBuildHelper.loadBuildUserAccessToken(build);
      expect(githubAccessToken).to.equal(siteUser.githubAccessToken);
      repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
    });

    it('should fetch a siteUser token - build user no permission', async () => {
      const siteUser = await factory.user();
      await site.addUser(siteUser);
      users = await site.getUsers();
      const repoNocks = [];
      repoNocks.push(githubAPINocks.repo({
        accessToken: user.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: user.username,
        response: [201, { permissions: {} }],
      }));
      repoNocks.push(githubAPINocks.repo({
        accessToken: siteUser.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: siteUser.username,
      }));
      await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
      const githubAccessToken = await GithubBuildHelper.loadBuildUserAccessToken(build);
      expect(githubAccessToken).to.equal(siteUser.githubAccessToken);
      repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
    });

    it('all site user w/o permissions to private repo', async () => {
      const siteUser = await factory.user();
      await site.addUser(siteUser);
      users = await site.getUsers();
      const repoNocks = [];
      repoNocks.push(githubAPINocks.repo({
        accessToken: user.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: user.username,
        response: [403, { permissions: {} }],
      }));
      repoNocks.push(githubAPINocks.repo({
        accessToken: siteUser.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: siteUser.username,
        response: [403, { permissions: {} }],
      }));
      repoNocks.push(githubAPINocks.repo({
        accessToken: user.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: user.username,
        response: [403, { permissions: {} }],
      }));
      await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
      const err = await GithubBuildHelper.loadBuildUserAccessToken(build).catch(e => e);
      repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
      expect(err.message).to.equal(`Unable to find valid access token to report build@id=${build.id} status`);
    });

    it('all site users withouth write access', async () => {
      const siteUser = await factory.user();
      await site.addUser(siteUser);
      users = await site.getUsers();
      const repoNocks = [];
      repoNocks.push(githubAPINocks.repo({
        accessToken: user.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: user.username,
        response: [201, { permissions: {} }],
      }));
      repoNocks.push(githubAPINocks.repo({
        accessToken: siteUser.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: siteUser.username,
        response: [201, { permissions: {} }],
      }));
      repoNocks.push(githubAPINocks.repo({
        accessToken: user.githubAccessToken,
        owner: site.owner,
        repo: site.repository,
        username: user.username,
        response: [201, { permissions: {} }],
      }));
      await build.reload({ include: [{ model: Site, include: [{ model: User }] }]});
      const err = await GithubBuildHelper.loadBuildUserAccessToken(build).catch(e => e);
      repoNocks.forEach(repoNock => expect(repoNock.isDone()).to.be.true);
      expect(err.message).to.equal(`Unable to find valid access token to report build@id=${build.id} status`);
    });
  });
});
