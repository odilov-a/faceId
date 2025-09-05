const { EntitySchema } = require("typeorm");

const User = new EntitySchema({
  name: "User",
  tableName: "users",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    firstName: {
      type: "varchar",
      nullable: false,
      length: 100,
    },
    lastName: {
      type: "varchar",
      nullable: false,
      length: 100,
    },
    faceEmbedding: {
      type: "float8",
      array: true,
      nullable: true,
    },
    createdAt: {
      type: "timestamp",
      createDate: true,
      default: () => "CURRENT_TIMESTAMP",
    },
  },
});

module.exports = { User };
