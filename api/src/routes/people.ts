import { Router } from 'express';
import { query } from '../db';
import { requireSession } from '../auth';

const router = Router();

router.get('/', requireSession, async (req, res) => {
  try {
    const [me] = await query<{ kind: string }>('select kind from person where id = $1', [res.locals.personId]);
    if (!me) {
      res.status(401).json({ error: 'not signed in' });
      return;
    }
    if (me.kind !== 'admin') {
      res.status(403).json({ error: 'not permitted' });
      return;
    }

    const kind = typeof req.query.kind === 'string' && req.query.kind ? req.query.kind : null;

    const params: unknown[] = [];
    let sql = 'select id, email, full_name, kind, credits, active from person';

    if (kind) {
      params.push(kind);
      sql += ` where kind = $${params.length}`;
    }

    sql += ' order by full_name';

    const people = await query(sql, params);
    res.json(people);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'could not load the people' });
  }
});

export default router;
