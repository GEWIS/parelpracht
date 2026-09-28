import 'reflect-metadata';
import * as fs from 'fs';
import path from 'path';
import express, { Express, json as expressJson, static as expressStatic } from 'express';
import 'dotenv/config';

import errorhandler from 'strong-error-handler';
import { serve as serverSwagger, setup as setupSwagger } from 'swagger-ui-express';
import methodOverride from 'method-override';
import bodyParser from 'body-parser';
import session from 'express-session';
import { TypeormStore } from 'connect-typeorm';
import passport from 'passport';
import { DataSource } from 'typeorm';
import swaggerDocument from '../build/swagger.json';
import { RegisterRoutes } from '../build/routes';
import startEvents from './timedevents/cron';
import './controllers/RootController';
import './controllers/ProductCategoryController';
import './controllers/ProductController';
import './controllers/CompanyController';
import './controllers/ContractController';
import './controllers/InvoiceController';
import './controllers/ContactController';
import './controllers/UserController';
import './controllers/RoleController';
import { Session } from './entity/Session';
import localStrategy, { localLogin } from './auth/LocalStrategy';
import { User } from './entity/User';
import UserService from './services/UserService';
import {
  appRoot,
  generateDirLoc,
  uploadCompanyLogoDirLoc,
  uploadDirLoc,
  uploadUserBackgroundDirLoc,
  workDirLoc,
} from './helpers/fileHelper';
import { ldapLogin, LDAPStrategy } from './auth';
import AppDataSource from './database';

const PORT = process.env.PORT || 3001;

export function setupSessionSupport(dataSource: DataSource, app: Express) {
  const sessionRepo = dataSource.getRepository(Session);

  // Setup session config
  const sess = {
    store: new TypeormStore({
      cleanupLimit: 2,
      limitSubquery: false,
      ttl: 84600,
    }).connect(sessionRepo),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: true,
    cookie: {},
  } as session.SessionOptions;

  if (process.env.NODE_ENV === 'production' && process.env.USE_HTTPS === 'true') {
    sess.cookie!.secure = true; // serve secure cookies
  }

  app.set('trust proxy', 2);
  app.use(session(sess));

  app.use(passport.initialize());
  app.use(passport.session());

  // Initialize passport config.
  // config();
}

export function createApp(dataSource: DataSource): Express {
  const app = express();

  app.use(expressJson({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ extended: false, limit: '50mb' }));

  app.set('trust proxy', 2);

  setupSessionSupport(dataSource, app);

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- async is allowed here
  passport.deserializeUser(async (id: number, done) => {
    try {
      const userRepo = dataSource.getRepository(User);
      const user = await userRepo.findOne({ where: { id }, relations: ['roles'] });
      if (user === undefined) {
        done(null, false);
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  passport.use(LDAPStrategy);
  passport.use(localStrategy);

  app.post('/api/login/ldap', ldapLogin);
  app.post('/api/login/local', localLogin);

  RegisterRoutes(app);

  app.use(methodOverride());

  for (const dir of [workDirLoc, generateDirLoc, uploadDirLoc, uploadCompanyLogoDirLoc, uploadUserBackgroundDirLoc]) {
    fs.mkdirSync(path.join(appRoot, dir), { recursive: true });
  }

  // Give additional error information when in development mode.
  app.use(
    errorhandler({
      debug: process.env.NODE_ENV === 'development',
      safeFields: ['message'],
    }),
  );

  // If env file specifies development, use swagger UI
  if (process.env.NODE_ENV === 'development') {
    app.use('/api/swagger-ui', serverSwagger, setupSwagger(swaggerDocument));
    app.get('/api/swagger.json', (req, res) => {
      res.json(swaggerDocument);
    });
  }

  app.use('/static/logos', expressStatic(path.join(appRoot, uploadCompanyLogoDirLoc)));
  app.use('/static/backgrounds', expressStatic(path.join(appRoot, uploadUserBackgroundDirLoc)));

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  AppDataSource.initialize()
    .then(async (dataSource) => {
      // Setup of database
      await new UserService().setupRoles();

      const app = createApp(dataSource);

      // Announce port that is listened to in the console
      app.listen(PORT, () => {
        console.info(`Server is listening on port ${PORT}`);
      });

      // Enable timed events
      startEvents();
    })
    .catch((e) => console.error(e));
}
