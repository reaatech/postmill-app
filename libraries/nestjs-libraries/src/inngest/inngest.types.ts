import { EventSchemas } from 'inngest';

export type InngestEvents = {
  'post/publish': {
    data: {
      postId: string;
      organizationId: string;
      taskQueue: string;
      maxConcurrentJob: number;
      postNow?: boolean;
    };
  };
  'post/cancel': {
    data: {
      postId: string;
    };
  };
  'email/send': {
    data: {
      to: string;
      subject: string;
      html: string;
      replyTo?: string;
      addTo?: 'top' | 'bottom';
    };
  };
  'autopost/process': {
    data: {
      id: string;
    };
  };
  'autopost/cancel': {
    data: {
      id: string;
    };
  };
  'integration/refresh-token': {
    data: {
      integrationId: string;
      organizationId: string;
    };
  };
  'integration/refresh-token/cancel': {
    data: {
      integrationId: string;
    };
  };
  'streak/start': {
    data: {
      organizationId: string;
    };
  };
  'streak/cancel': {
    data: {
      organizationId: string;
    };
  };
  'analytics/backfill': {
    data: {
      integrationId: string;
      organizationId: string;
    };
  };

};

export const inngestSchemas = new EventSchemas().fromRecord<InngestEvents>();
