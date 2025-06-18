import { Sequelize, Op } from "sequelize";
import Queue from "../../models/Queue";
import Company from "../../models/Company";
import User from "../../models/User";

interface Request {
  searchParam?: string;
  pageNumber?: string | number;
  profile?: string;
  companyId?: number;
  superUser?: string;
}

interface Response {
  users: User[];
  count: number;
  hasMore: boolean;
}

const ListUsersService = async ({
  searchParam = "",
  pageNumber = "1",
  companyId,
  superUser
}: Request): Promise<Response> => {

  let whereCondition = {};

  console.log(typeof superUser)

  if(superUser == "true"){
    whereCondition = {
      [Op.or]: [
        {
          "$User.name$": Sequelize.where(
            Sequelize.fn("LOWER", Sequelize.col("User.name")),
            "LIKE",
            `%${searchParam.toLowerCase()}%`
          )
        },
        { email: { [Op.like]: `%${searchParam.toLowerCase()}%` } }
      ]
    };
  }else{
    whereCondition = {
      [Op.or]: [
        {
          "$User.name$": Sequelize.where(
            Sequelize.fn("LOWER", Sequelize.col("User.name")),
            "LIKE",
            `%${searchParam.toLowerCase()}%`
          )
        },
        { email: { [Op.like]: `%${searchParam.toLowerCase()}%` } }
      ],
      companyId: {
        [Op.eq]: companyId
      }
    };
  }

  console.log(whereCondition)



  const limit = 20;
  const offset = limit * (+pageNumber - 1);

  const { count, rows: users } = await User.findAndCountAll({
    where: whereCondition,
    attributes: ["name", "id", "email", "companyId", "profile", "createdAt"],
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      { model: Queue, as: "queues", attributes: ["id", "name", "color"] },
      { model: Company, as: "company", attributes: ["id", "name"] }
    ]
  });

  const hasMore = count > offset + users.length;

  return {
    users,
    count,
    hasMore
  };
};

export default ListUsersService;
