import { QueryInterface } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addConstraint("Queues",  {
        name: "Queues_color_key",
        type: 'unique',
        fields: ["color", "companyId"],
      }),
      queryInterface.addConstraint("Queues",  {
        name: "Queues_name_key",
        type: 'unique',
        fields: ["name", "companyId"],
      }),
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeConstraint("Queues", "Queues_color_key"),
      queryInterface.removeConstraint("Queues", "Queues_name_key"),
    ]);
  }
};
