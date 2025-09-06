const { EntitySchema } = require("typeorm");

const Admin = new EntitySchema({
  name: "Admin",
  tableName: "admins",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    username: {
      type: "varchar",
      nullable: false,
      length: 100,
    },
    password: {
      type: "varchar",
      nullable: false,
      length: 100,
    },
    role: {
      type: "varchar",
      default: "admin",
      nullable: false,
    },
    createdAt: {
      type: "timestamp",
      createDate: true,
      default: () => "CURRENT_TIMESTAMP",
    },
  },
});

module.exports = { Admin };
